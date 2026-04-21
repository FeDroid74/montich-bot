import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, type LearningAnswer, type LearningCard } from "../../learning/service.js";
import { createAnswerKeyboard, createRevealTranslationKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";

const SESSION_CARD_LIMIT = 7;

interface LearningSession {
  totalCards: number;
  answeredCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: number;
}

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);
  const activeCards = new Map<number, LearningCard>();
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
      `Начинаем мини-сессию: ${SESSION_CARD_LIMIT} карточек. Пиши перевод сообщением или используй кнопки-подсказки.`,
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

  bot.action(/^learn:show:(\d+)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    await learningService.ensureUser(ctx.from);
    const activeCard = activeCards.get(ctx.from.id);
    const wordId = Number.parseInt(ctx.match[1], 10);

    if (!activeCard || activeCard.wordId !== wordId) {
      await ctx.answerCbQuery("Карточка устарела. Открой новую.");
      return;
    }

    await ctx.editMessageText(
      formatLearningCard(activeCard.serbianLatin, activeCard.russianTranslation),
      createAnswerKeyboard(activeCard.wordId),
    );
  });

  bot.action(/^learn:rate:(\d+):(known|again)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const activeCard = activeCards.get(ctx.from.id);
    const session = activeSessions.get(ctx.from.id);
    const wordId = Number.parseInt(ctx.match[1], 10);
    const answer = ctx.match[2] as LearningAnswer;

    if (!activeCard || activeCard.wordId !== wordId || !session) {
      await ctx.answerCbQuery("Сессия устарела. Начни заново через «Учить сербский».");
      return;
    }

    await learningService.registerAnswer(user.id, wordId, answer);
    updateSessionStats(session, answer === "known");
    activeCards.delete(ctx.from.id);
    await ctx.answerCbQuery(answer === "known" ? "Сохранил как знакомое слово." : "Отмечено на повторение.");
    await safelyRemoveInlineKeyboard(ctx);
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

    const activeCard = activeCards.get(ctx.from.id);
    const session = activeSessions.get(ctx.from.id);

    if (!activeCard || !session) {
      return next();
    }

    const user = await learningService.ensureUser(ctx.from);
    const checkResult = learningService.checkTranslationAnswer(text, activeCard.russianTranslation);
    const answer: LearningAnswer = checkResult.isCorrect ? "known" : "again";

    await learningService.registerAnswer(user.id, activeCard.wordId, answer);
    updateSessionStats(session, checkResult.isCorrect);
    activeCards.delete(ctx.from.id);

    if (checkResult.isCorrect) {
      await ctx.reply([
        "Верно.",
        `Сербский: ${activeCard.serbianLatin}`,
        `Перевод: ${activeCard.russianTranslation}`,
      ].join("\n"));
    } else {
      await ctx.reply([
        "Пока неверно.",
        `Твой ответ: ${text}`,
        `Правильный перевод: ${activeCard.russianTranslation}`,
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
  activeCards: Map<number, LearningCard>,
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

  activeCards.set(ctx.from.id, nextCard);

  await ctx.reply(
    formatPromptCard(nextCard.serbianLatin, session),
    createRevealTranslationKeyboard(nextCard.wordId),
  );
}

function formatPromptCard(serbianLatin: string, session: LearningSession): string {
  return [
    `Карточка ${session.answeredCards + 1}/${session.totalCards}`,
    `Сербский: ${serbianLatin}`,
    "Напиши перевод на русский сообщением или открой подсказку кнопкой ниже.",
  ].join("\n");
}

function formatLearningCard(serbianLatin: string, russianTranslation: string): string {
  return [
    "Карточка",
    `Сербский: ${serbianLatin}`,
    `Перевод: ${russianTranslation}`,
    "Теперь можешь оценить слово кнопками ниже.",
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
