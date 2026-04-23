import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, parseReminderTime, type LearningAnswer, type LearningItem, type LearningSettings } from "../../learning/service.js";
import { PhraseService } from "../../phrases/service.js";
import { VocabularyService } from "../../vocabulary/service.js";
import { registerAdminDictionaryHandlers } from "./admin-dictionary.js";
import { registerPhraseHandlers } from "./phrases.js";
import { createLearningCardKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";
import { createAdminDictionaryPanelKeyboard, createSettingsPanelKeyboard } from "../keyboards/panels.js";

interface LearningSession {
  totalCards: number;
  answeredCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: number;
  servedItemKeys: string[];
}

interface ActiveLearningItem {
  item: LearningItem;
  promptMessageId: number;
}

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);
  const vocabularyService = new VocabularyService(context.database);
  const phraseService = new PhraseService(context.database);
  const activeItems = new Map<number, ActiveLearningItem>();
  const activeSessions = new Map<number, LearningSession>();

  registerAdminDictionaryHandlers(bot, learningService, vocabularyService);
  registerPhraseHandlers(bot, learningService, phraseService);

  bot.start(async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    activeItems.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);

    await ctx.reply(
      "Бот Montich запущен. Выбирай нужный раздел кнопками ниже: обучение, фразы, настройки или словарь.",
      createMainMenuKeyboard(user.role === "admin"),
    );
  });

  bot.command("menu", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    await ctx.reply("Главное меню обновлено.", createMainMenuKeyboard(user.role === "admin"));
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
    await showSettingsPanel(ctx, learningService);
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
    activeItems.delete(ctx.from.id);

    await sendNextLearningItem(ctx, learningService, activeItems, activeSessions, {
      leadText: `Начинаем мини-сессию: ${totalCards} карточек. Пиши перевод сообщением, а если не знаешь слово или фразу, нажимай кнопку ниже.`,
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

  bot.hears(MAIN_MENU_BUTTONS.phrases, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const phrases = await phraseService.listPhrases(user.id, 10);

    if (phrases.length === 0) {
      await ctx.reply([
        "У тебя пока нет сохраненных фраз.",
        "Добавь первую фразу командой:",
        "/add_phrase Dobar dan svima | добрый день всем",
      ].join("\n"));
      return;
    }

    await ctx.reply([
      `Последние фразы: ${phrases.length}`,
      ...phrases.map((phrase) => `${phrase.id}. ${phrase.originalText} -> ${phrase.russianTranslation ?? "-"}`),
      "Чтобы добавить новую фразу, используй /add_phrase Фраза | перевод",
    ].join("\n"));
  });

  bot.hears(MAIN_MENU_BUTTONS.settings, async (ctx) => {
    await showSettingsPanel(ctx, learningService);
  });

  bot.hears(MAIN_MENU_BUTTONS.adminDictionary, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);

    if (user.role !== "admin") {
      await ctx.reply("Раздел доступен только администратору.");
      return;
    }

    await ctx.reply(formatAdminDictionaryPanel(), createAdminDictionaryPanelKeyboard());
  });

  bot.hears(MAIN_MENU_BUTTONS.faq, async (ctx) => {
    await ctx.reply("Раздел FAQ будет следующим этапом. Сейчас приоритет на обучение языку.");
  });

  bot.hears(MAIN_MENU_BUTTONS.donate, async (ctx) => {
    if (context.config.bot.donationUrl) {
      await ctx.reply(`Поддержать проект: ${context.config.bot.donationUrl}`);
      return;
    }

    await ctx.reply("Ссылка на поддержку проекта пока не настроена.");
  });

  bot.action("settings:show", async (ctx) => {
    await showSettingsPanel(ctx, learningService, true);
  });

  bot.action(/^settings:goal:(5|10)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const minutes = Number.parseInt(ctx.match[1], 10);
    await learningService.updateDailyGoal(user.id, minutes);
    await ctx.answerCbQuery(`Цель обновлена: ${minutes} мин.`);
    await showSettingsPanel(ctx, learningService, true);
  });

  bot.action(/^settings:reminder:(20:00|21:00)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    await learningService.setReminder(user.id, ctx.match[1]);
    await ctx.answerCbQuery(`Напоминание установлено на ${ctx.match[1]}.`);
    await showSettingsPanel(ctx, learningService, true);
  });

  bot.action("settings:reminder:off", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    await learningService.disableReminder(user.id);
    await ctx.answerCbQuery("Напоминания выключены.");
    await showSettingsPanel(ctx, learningService, true);
  });

  bot.action(/^admin:list:(all|active|hidden)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);

    if (user.role !== "admin") {
      await ctx.answerCbQuery("Раздел доступен только администратору.");
      return;
    }

    const filter = ctx.match[1] as "all" | "active" | "hidden";
    const words = await vocabularyService.listWords(filter);
    await ctx.answerCbQuery();

    if (words.length === 0) {
      await ctx.reply("Список слов пуст.");
      return;
    }

    const header = filter === "all"
      ? `Всего слов: ${words.length}`
      : filter === "active"
        ? `Активных слов: ${words.length}`
        : `Скрытых слов: ${words.length}`;

    const chunks = chunkLines([
      header,
      ...words.map((word) => `${word.id}. ${word.serbianLatin} -> ${word.russianTranslation} [${word.isActive ? "активно" : "скрыто"}]`),
    ], 3300);

    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  });

  bot.action(/^learn:unknown:(word|phrase):(\d+)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const activeState = activeItems.get(ctx.from.id);
    const session = activeSessions.get(ctx.from.id);
    const expectedKey = `${ctx.match[1]}:${ctx.match[2]}`;

    if (!activeState || !session || getLearningItemKey(activeState.item) !== expectedKey) {
      await ctx.answerCbQuery("Сессия устарела. Нажми «Учить сербский» и начни заново.");
      return;
    }

    await learningService.registerAnswer(user.id, activeState.item, "again");
    updateSessionStats(session, activeState.item, false);
    activeItems.delete(ctx.from.id);
    await ctx.answerCbQuery();
    await sendNextLearningItem(ctx, learningService, activeItems, activeSessions, {
      leadText: formatUnknownLearningItem(activeState.item),
      cleanupMessageIds: [activeState.promptMessageId],
    });
  });

  bot.action("learn:stop", async (ctx) => {
    if (ctx.from) {
      const activeState = activeItems.get(ctx.from.id) ?? null;
      activeItems.delete(ctx.from.id);
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

    const activeState = activeItems.get(ctx.from.id);
    const session = activeSessions.get(ctx.from.id);

    if (!activeState || !session) {
      return next();
    }

    const user = await learningService.ensureUser(ctx.from);
    const checkResult = learningService.checkTranslationAnswer(text, activeState.item.russianTranslation);
    const answer: LearningAnswer = checkResult.isCorrect ? "known" : "again";

    await learningService.registerAnswer(user.id, activeState.item, answer);
    updateSessionStats(session, activeState.item, checkResult.isCorrect);
    activeItems.delete(ctx.from.id);

    await sendNextLearningItem(ctx, learningService, activeItems, activeSessions, {
      leadText: checkResult.isCorrect
        ? formatCorrectAnswerResult(activeState.item)
        : formatWrongAnswerResult(text, activeState.item.russianTranslation),
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
    servedItemKeys: [],
  };
}

function updateSessionStats(session: LearningSession, item: LearningItem, isCorrect: boolean): void {
  session.answeredCards += 1;
  session.servedItemKeys.push(getLearningItemKey(item));

  if (isCorrect) {
    session.correctAnswers += 1;
  } else {
    session.wrongAnswers += 1;
  }
}

async function sendNextLearningItem(
  ctx: Context,
  learningService: LearningService,
  activeItems: Map<number, ActiveLearningItem>,
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
    activeItems.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply(joinMessageParts([
      options.leadText,
      formatSessionSummary(session, false),
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const nextItem = await learningService.getNextItem(user.id, session.servedItemKeys);

  if (!nextItem) {
    activeItems.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    await ctx.reply(joinMessageParts([
      options.leadText,
      "Материал для обучения пока закончился.",
      formatSessionSummary(session, false),
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  const sentMessage = await ctx.reply(
    joinMessageParts([
      options.leadText,
      formatPromptItem(nextItem, session),
    ]),
    createLearningCardKeyboard(getLearningItemKey(nextItem)),
  );

  activeItems.set(ctx.from.id, {
    item: nextItem,
    promptMessageId: sentMessage.message_id,
  });

  await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
}

async function showSettingsPanel(ctx: Context, learningService: LearningService, replaceMessage = false): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const settings = await learningService.getUserSettings(user.id);
  const sessionCardLimit = await learningService.getSessionCardLimit(user.id);
  const text = formatSettingsPanel(settings, sessionCardLimit);
  const keyboard = createSettingsPanelKeyboard(settings);

  if (replaceMessage && canEditMessageText(ctx)) {
    await ctx.editMessageText(text, keyboard);
    return;
  }

  await ctx.reply(text, keyboard);
}

function formatPromptItem(item: LearningItem, session: LearningSession): string {
  if (item.kind === "word") {
    return [
      `Карточка ${session.answeredCards + 1}/${session.totalCards}`,
      `Слово: ${item.serbianLatin}`,
      "Напиши перевод на русский сообщением. Если не знаешь слово, нажми кнопку ниже.",
    ].join("\n");
  }

  return [
    `Карточка ${session.answeredCards + 1}/${session.totalCards}`,
    `Фраза: ${item.serbianText}`,
    "Напиши перевод фразы на русский сообщением. Если не знаешь фразу, нажми кнопку ниже.",
  ].join("\n");
}

function formatCorrectAnswerResult(item: LearningItem): string {
  if (item.kind === "word") {
    return [
      "Верно.",
      `Слово: ${item.serbianLatin}`,
      `Перевод: ${item.russianTranslation}`,
    ].join("\n");
  }

  return [
    "Верно.",
    `Фраза: ${item.serbianText}`,
    `Перевод: ${item.russianTranslation}`,
  ].join("\n");
}

function formatWrongAnswerResult(answer: string, russianTranslation: string): string {
  return [
    "Пока неверно.",
    `Твой ответ: ${answer}`,
    `Правильный перевод: ${russianTranslation}`,
  ].join("\n");
}

function formatUnknownLearningItem(item: LearningItem): string {
  if (item.kind === "word") {
    return [
      "Слово отмечено на повторение.",
      `Слово: ${item.serbianLatin}`,
      `Перевод: ${item.russianTranslation}`,
    ].join("\n");
  }

  return [
    "Фраза отмечена на повторение.",
    `Фраза: ${item.serbianText}`,
    `Перевод: ${item.russianTranslation}`,
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

function formatSettingsPanel(settings: LearningSettings, sessionCardLimit: number): string {
  return [
    "Настройки обучения:",
    `Цель в день: ${settings.dailyGoalMinutes} мин.`,
    `Карточек в мини-сессии: ${sessionCardLimit}`,
    `Напоминание: ${settings.reminderTime ?? "выключено"}`,
    `Часовой пояс: ${settings.timezone}`,
    "Ниже можно быстро поменять цель и напоминания кнопками.",
  ].join("\n");
}

function formatAdminDictionaryPanel(): string {
  return [
    "Админ-словарь:",
    "1. Сначала открой список слов кнопками ниже.",
    "2. Найди нужный ID.",
    "3. Потом используй команды редактирования:",
    "/word 12",
    "/edit_word 12 | Nova reč | новое слово",
    "/deactivate_word 12",
    "/activate_word 12",
    "/add_word Nova reč - новое слово",
  ].join("\n");
}

function getLearningItemKey(item: LearningItem): string {
  return `${item.kind}:${item.itemId}`;
}

function joinMessageParts(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join("\n\n");
}

function chunkLines(lines: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    const nextChunk = currentChunk ? `${currentChunk}\n${line}` : line;

    if (nextChunk.length > maxLength && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = line;
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
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

function canEditMessageText(ctx: Context): ctx is Context & { editMessageText: (text: string, extra?: unknown) => Promise<unknown> } {
  return typeof (ctx as { editMessageText?: unknown }).editMessageText === "function";
}
