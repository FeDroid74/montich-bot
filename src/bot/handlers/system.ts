import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, parseReminderTime, type LearningAnswer, type LearningCard } from "../../learning/service.js";
import { VocabularyService } from "../../vocabulary/service.js";
import { registerAdminDictionaryHandlers } from "./admin-dictionary.js";
import { createLearningCardKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";

interface LearningSession {
  totalCards: number;
  answeredCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: number;
  servedWordIds: number[];
}

interface ActiveLearningCard {
  card: LearningCard;
  promptMessageId: number;
}

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);
  const vocabularyService = new VocabularyService(context.database);
  const activeCards = new Map<number, ActiveLearningCard>();
  const activeSessions = new Map<number, LearningSession>();

  registerAdminDictionaryHandlers(bot, learningService, vocabularyService);

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

  bot.command("settings", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const settings = await learningService.getUserSettings(user.id);
    const sessionCardLimit = await learningService.getSessionCardLimit(user.id);

    await ctx.reply([
      "Текущие настройки:",
      `Цель в день: ${settings.dailyGoalMinutes} мин.`,
      `Карточек в мини-сессии: ${sessionCardLimit}`,
      `Напоминание: ${settings.reminderTime ?? "выключено"}`,
      `Часовой пояс: ${settings.timezone}`,
      "Команды: /goal 5, /goal 10, /reminder 20:00, /reminder_off",
    ].join("\n"));
  });

  bot.command("goal", async (ctx) => {
    if (!ctx.from || !hasTextMessage(ctx)) {
      return;
    }

    const rawValue = ctx.message.text.split(/\s+/)[1];

    if (!rawValue) {
      await ctx.reply("Использование: /goal 5 или /goal 10");
      return;
    }

    const minutes = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10) {
      await ctx.reply("Допустимое значение: от 5 до 10 минут.");
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const settings = await learningService.updateDailyGoal(user.id, minutes);
    const sessionCardLimit = await learningService.getSessionCardLimit(user.id);

    await ctx.reply([
      `Обновил цель: ${settings.dailyGoalMinutes} мин. в день.`,
      `Теперь мини-сессия будет на ${sessionCardLimit} карточек.`,
    ].join("\n"));
  });

  bot.command("reminder", async (ctx) => {
    if (!ctx.from || !hasTextMessage(ctx)) {
      return;
    }

    const rawTime = ctx.message.text.split(/\s+/)[1];
    const user = await learningService.ensureUser(ctx.from);

    if (!rawTime) {
      const settings = await learningService.getUserSettings(user.id);
      await ctx.reply([
        `Текущее напоминание: ${settings.reminderTime ?? "выключено"}`,
        `Часовой пояс: ${settings.timezone}`,
        "Пример установки: /reminder 20:00",
      ].join("\n"));
      return;
    }

    const reminderTime = parseReminderTime(rawTime);

    if (!reminderTime) {
      await ctx.reply("Некорректное время. Используй формат HH:MM, например /reminder 20:00");
      return;
    }

    const settings = await learningService.setReminder(user.id, reminderTime);
    await ctx.reply(`Ежедневное напоминание установлено на ${settings.reminderTime} (${settings.timezone}).`);
  });

  bot.command("reminder_off", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    await learningService.disableReminder(user.id);
    await ctx.reply("Ежедневные напоминания выключены.");
  });

  bot.hears(MAIN_MENU_BUTTONS.learnSerbian, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const totalCards = await learningService.getSessionCardLimit(user.id);

    activeSessions.set(ctx.from.id, createLearningSession(totalCards));
    activeCards.delete(ctx.from.id);

    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions, {
      leadText: `Начинаем мини-сессию: ${totalCards} карточек. Пиши перевод сообщением, а если не знаешь слово, нажимай кнопку ниже.`,
    });
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
    const session = activeSessions.get(ctx.from.id);

    if (!activeState || !session) {
      await ctx.answerCbQuery("Сессия устарела. Нажми «Учить сербский» и начни заново.");
      return;
    }

    await learningService.registerAnswer(user.id, activeState.card.wordId, "again");
    updateSessionStats(session, activeState.card.wordId, false);
    activeCards.delete(ctx.from.id);
    await ctx.answerCbQuery();
    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions, {
      leadText: formatUnknownWordRevealCard(activeState.card.serbianLatin, activeState.card.russianTranslation),
      cleanupMessageIds: [activeState.promptMessageId],
    });
  });

  bot.action("learn:stop", async (ctx) => {
    if (ctx.from) {
      const activeState = activeCards.get(ctx.from.id) ?? null;
      activeCards.delete(ctx.from.id);
      const session = activeSessions.get(ctx.from.id) ?? null;
      activeSessions.delete(ctx.from.id);

      await ctx.answerCbQuery();

      if (session) {
        await ctx.reply(formatSessionSummary(session, true));
        await safeDeleteMessages(ctx, activeState ? [activeState.promptMessageId] : []);
      } else {
        await ctx.reply("Сессию завершил. Когда будешь готов, снова нажми «Учить сербский»." );
      }

      return;
    }

    await ctx.answerCbQuery();
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
    updateSessionStats(session, activeState.card.wordId, checkResult.isCorrect);
    activeCards.delete(ctx.from.id);

    await sendNextLearningCard(ctx, learningService, activeCards, activeSessions, {
      leadText: checkResult.isCorrect
        ? formatCorrectAnswerResult(activeState.card.serbianLatin, activeState.card.russianTranslation)
        : formatWrongAnswerResult(text, activeState.card.russianTranslation),
      cleanupMessageIds: [activeState.promptMessageId, ctx.message.message_id],
    });
  });
}

function createLearningSession(totalCards: number): LearningSession {
  return {
    totalCards,
    answeredCards: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    startedAt: Date.now(),
    servedWordIds: [],
  };
}

function updateSessionStats(session: LearningSession, wordId: number, isCorrect: boolean): void {
  session.answeredCards += 1;
  session.servedWordIds.push(wordId);

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
  options: {
    leadText?: string;
    cleanupMessageIds?: number[];
  } = {},
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const session = activeSessions.get(ctx.from.id);

  if (!session) {
    await ctx.reply(joinMessageParts([
      options.leadText,
      "Сессия не активна. Нажми «Учить сербский», чтобы начать новую мини-сессию.",
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  if (session.answeredCards >= session.totalCards) {
    activeCards.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply(joinMessageParts([
      options.leadText,
      formatSessionSummary(session, false),
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const nextCard = await learningService.getNextCard(user.id, session.servedWordIds);

  if (!nextCard) {
    activeCards.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply(joinMessageParts([
      options.leadText,
      "Слова для обучения пока закончились.",
      formatSessionSummary(session, false),
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  const sentMessage = await ctx.reply(
    joinMessageParts([
      options.leadText,
      formatPromptCard(nextCard.serbianLatin, session),
    ]),
    createLearningCardKeyboard(nextCard.wordId),
  );

  activeCards.set(ctx.from.id, {
    card: nextCard,
    promptMessageId: sentMessage.message_id,
  });

  await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
}

function formatPromptCard(serbianLatin: string, session: LearningSession): string {
  return [
    `Карточка ${session.answeredCards + 1}/${session.totalCards}`,
    `Слово: ${serbianLatin}`,
    "Напиши перевод на русский сообщением. Если не знаешь слово, нажми кнопку ниже.",
  ].join("\n");
}

function formatCorrectAnswerResult(serbianLatin: string, russianTranslation: string): string {
  return [
    "Верно.",
    `Слово: ${serbianLatin}`,
    `Перевод: ${russianTranslation}`,
  ].join("\n");
}

function formatWrongAnswerResult(answer: string, russianTranslation: string): string {
  return [
    "Пока неверно.",
    `Твой ответ: ${answer}`,
    `Правильный перевод: ${russianTranslation}`,
  ].join("\n");
}

function formatUnknownWordRevealCard(serbianLatin: string, russianTranslation: string): string {
  return [
    "Слово отмечено на повторение.",
    `Слово: ${serbianLatin}`,
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

function joinMessageParts(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}

async function safeDeleteMessages(ctx: Context, messageIds: number[]): Promise<void> {
  if (!ctx.chat) {
    return;
  }

  for (const messageId of messageIds) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
    } catch {
      // Ignore deletion failures for already deleted or stale messages.
    }
  }
}

function hasTextMessage(ctx: Context): ctx is Context & { message: { text: string } } {
  return Boolean(ctx.message && "text" in ctx.message);
}
