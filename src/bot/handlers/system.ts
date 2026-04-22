import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, type LearningAnswer, type LearningCard } from "../../learning/service.js";
import { createLearningCardKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";

const SESSION_CARD_LIMIT = 10;

interface LearningSession {
  totalCards: number;
  answeredCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: number;
}

interface ActiveLearningCard {
  card: LearningCard;
}

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);
  const activeCards = new Map<number, ActiveLearningCard>();
  const activeSessions = new Map<number, LearningSession>();

  bot.start(async (ctx) => {
    if (ctx.from) {
      await learningService.ensureUser(ctx.from);
      activeCards.delete(ctx.from.id);
      activeSessions.delete(ctx.from.id);
    }

    await ctx.reply(
      "Бот Montich запущен. Можно учить слова, смотреть прогресс и постепенно расширять функциональность.",
      createMainMenuKeyboard(),
    );
  });

  bot.command("health", async (ctx) => {
    const databaseStatus = context.database.getStatus();

    await ctx.reply([
      "Бот работает исправно.",
      `Среда: ${context.config.runtimeEnvironment}`,
      `База данных: ${databaseStatus.label}`,
    ].join("\n"));
  });

  bot.hears(MAIN_MENU_BUTTONS.learnSerbian, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    activeSessions.set(ctx.from.id, createLearningSession());
    activeCards.delete(ctx.from.id);

    await ctx.reply(
      `Начинаем мини-сессию: ${SESSION_CARD_LIMIT} карточек. Пиши перевод сообщением, а если не знаешь слово, нажимай кнопку ниже.`,
    );

    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions);
  });

  bot.hears(MAIN_MENU_BUTTONS.progress, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const summary = await learningService.getProgressSummary(user.id);

    await ctx.reply([
      "Текущий прогресс:",
      `Всего слов в словаре: ${summary.totalWords}`,
      `Карточек в личном прогрессе: ${summary.trackedWords}`,
      `Активных слов: ${summary.activeWords}`,
      `Освоенных слов: ${summary.masteredWords}`,
      `Готово к повторению: ${summary.dueWords}`,
    ].join("\n"));
  });

  bot.hears(MAIN_MENU_BUTTONS.faq, async (ctx) => {
    await ctx.reply("Раздел FAQ будет следующим этапом. Сейчас уже готов учебный модуль и база слов.");
  });

  bot.hears(MAIN_MENU_BUTTONS.donate, async (ctx) => {
    if (context.config.bot.donationUrl) {
      await ctx.reply(`Поддержать проект: ${context.config.bot.donationUrl}`);
      return;
    }

    await ctx.reply("Ссылка на поддержку проекта пока не настроена.");
  });

  bot.action(/^learn:mode:unknown:(\d+)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const activeState = activeCards.get(ctx.from.id);
    const wordId = Number.parseInt(ctx.match[1], 10);
    const session = activeSessions.get(ctx.from.id);

    if (!activeState || activeState.card.wordId !== wordId || !session) {
      await ctx.answerCbQuery("Сессия устарела. Нажми «Учить сербский» и начни заново.");
      return;
    }

    await learningService.registerAnswer(user.id, activeState.card.wordId, "again");
    updateSessionStats(session, false);
    activeCards.delete(ctx.from.id);
    await ctx.answerCbQuery("Показываю перевод и отправляю слово на повторение.");
    await ctx.editMessageText(formatUnknownWordRevealCard(activeState.card.serbianLatin, activeState.card.russianTranslation));
    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions);
  });

  bot.action("learn:stop", async (ctx) => {
    if (ctx.from) {
      activeCards.delete(ctx.from.id);
      const session = activeSessions.get(ctx.from.id) ?? null;
      activeSessions.delete(ctx.from.id);

      await ctx.answerCbQuery("Сессию остановил.");
      await safelyRemoveInlineKeyboard(ctx);

      if (session) {
        await ctx.reply(formatSessionSummary(session, true));
      } else {
        await ctx.reply("Сессию завершил. Когда будешь готов, снова нажми «Учить сербский»." );
      }

      return;
    }

    await ctx.answerCbQuery("Сессию остановил.");
  });

  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text.trim();

    if (text.startsWith("/") || !ctx.from) {
      return next();
    }

    if (Object.values(MAIN_MENU_BUTTONS).includes(text as (typeof MAIN_MENU_BUTTONS)[keyof typeof MAIN_MENU_BUTTONS])) {
      return next();
    }

    const activeState = activeCards.get(ctx.from.id);
    const session = activeSessions.get(ctx.from.id);

    if (!activeState || !session) {
      return next();
    }

    const user = await learningService.ensureUser(ctx.from);
    const checkResult = learningService.checkTranslationAnswer(text, activeState.card.russianTranslation);
    const answer: LearningAnswer = checkResult.isCorrect ? "known" : "again";

    await learningService.registerAnswer(user.id, activeState.card.wordId, answer);
    updateSessionStats(session, checkResult.isCorrect);
    activeCards.delete(ctx.from.id);

    if (checkResult.isCorrect) {
      await ctx.reply([
        "Верно.",
        `Сербский: ${activeState.card.serbianLatin}`,
        `Перевод: ${activeState.card.russianTranslation}`,
      ].join("\n"));
    } else {
      await ctx.reply([
        "Пока неверно.",
        `Твой ответ: ${text}`,
        `Правильный перевод: ${activeState.card.russianTranslation}`,
      ].join("\n"));
    }

    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions);
  });
}

function createLearningSession(): LearningSession {
  return {
    totalCards: SESSION_CARD_LIMIT,
    answeredCards: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    startedAt: Date.now(),
  };
}

function updateSessionStats(session: LearningSession, isCorrect: boolean): void {
  session.answeredCards += 1;

  if (isCorrect) {
    session.correctAnswers += 1;
  } else {
    session.wrongAnswers += 1;
  }
}

async function sendNextLearningCard(
  ctx: Context,
  learningService: LearningService,
  activeCards: Map<number, ActiveLearningCard>,
  activeSessions: Map<number, LearningSession>,
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const session = activeSessions.get(ctx.from.id);

  if (!session) {
    await ctx.reply("Сессия не активна. Нажми «Учить сербский», чтобы начать новую мини-сессию.");
    return;
  }

  if (session.answeredCards >= session.totalCards) {
    activeCards.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply(formatSessionSummary(session, false));
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const nextCard = await learningService.getNextCard(user.id);

  if (!nextCard) {
    activeCards.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply([
      "Слова для обучения пока закончились.",
      formatSessionSummary(session, false),
    ].join("\n\n"));
    return;
  }

  activeCards.set(ctx.from.id, {
    card: nextCard,
  });

  await ctx.reply(
    formatPromptCard(nextCard.serbianLatin, session),
    createLearningCardKeyboard(nextCard.wordId),
  );
}

function formatPromptCard(serbianLatin: string, session: LearningSession): string {
  return [
    `Карточка ${session.answeredCards + 1}/${session.totalCards}`,
    `Сербский: ${serbianLatin}`,
    "Напиши перевод на русский сообщением. Если не знаешь слово, нажми кнопку ниже.",
  ].join("\n");
}

function formatUnknownWordRevealCard(serbianLatin: string, russianTranslation: string): string {
  return [
    "Слово отмечено на повторение.",
    `Сербский: ${serbianLatin}`,
    `Перевод: ${russianTranslation}`,
  ].join("\n");
}

function formatSessionSummary(session: LearningSession, interrupted: boolean): string {
  const accuracy = session.answeredCards > 0
    ? Math.round((session.correctAnswers / session.answeredCards) * 100)
    : 0;
  const durationMinutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));

  return [
    interrupted ? "Мини-сессия остановлена." : "Мини-сессия завершена.",
    `Карточек отвечено: ${session.answeredCards}/${session.totalCards}`,
    `Верных ответов: ${session.correctAnswers}`,
    `На повторение: ${session.wrongAnswers}`,
    `Точность: ${accuracy}%`,
    `Длительность: около ${durationMinutes} мин.`,
  ].join("\n");
}

type InlineKeyboardCleanupContext = Context & {
  editMessageReplyMarkup(markup?: undefined): Promise<unknown>;
};

async function safelyRemoveInlineKeyboard(ctx: InlineKeyboardCleanupContext): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // Ignore stale message edits from Telegram callbacks.
  }
}
