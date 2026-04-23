import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, parseReminderTime, type LearningAnswer, type LearningItem, type LearningSettings } from "../../learning/service.js";
import { PhraseService } from "../../phrases/service.js";
import { VocabularyService } from "../../vocabulary/service.js";
import { registerAdminDictionaryHandlers } from "./admin-dictionary.js";
import { registerPhraseHandlers } from "./phrases.js";
import { createLearningCardKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";
import {
  createAdminDictionaryPanelKeyboard,
  createReminderSettingsKeyboard,
  createSettingsHomeKeyboard,
  createStudyTimeKeyboard,
} from "../keyboards/panels.js";

type SettingsSection = "home" | "study" | "reminder";

interface LearningSession {
  durationMinutes: number;
  answeredCards: number;
  correctAnswers: number;
  wrongAnswers: number;
  startedAt: number;
  endsAt: number;
  servedItemKeys: string[];
}

interface ActiveLearningItem {
  item: LearningItem;
  promptMessageId: number;
}

interface PendingInputState {
  kind: "reminder_time";
}

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);
  const vocabularyService = new VocabularyService(context.database);
  const phraseService = new PhraseService(context.database);
  const activeItems = new Map<number, ActiveLearningItem>();
  const activeSessions = new Map<number, LearningSession>();
  const pendingInputs = new Map<number, PendingInputState>();

  registerAdminDictionaryHandlers(bot, learningService, vocabularyService);
  registerPhraseHandlers(bot, learningService, phraseService);

  bot.start(async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    activeItems.delete(ctx.from.id);
    activeSessions.delete(ctx.from.id);
    pendingInputs.delete(ctx.from.id);

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
    await showSettingsPanel(ctx, learningService, "home");
  });

  bot.command("goal", async (ctx) => {
    if (!ctx.from || !hasTextMessage(ctx)) {
      return;
    }

    const rawValue = ctx.message.text.split(/\s+/)[1];

    if (!rawValue) {
      await ctx.reply("Использование: /goal 5, /goal 10 или /goal 15");
      return;
    }

    const minutes = Number.parseInt(rawValue, 10);

    if (!Number.isInteger(minutes) || ![5, 10, 15].includes(minutes)) {
      await ctx.reply("Допустимые значения: 5, 10 или 15 минут.");
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    await learningService.updateDailyGoal(user.id, minutes);
    await ctx.reply(`Время обучения обновлено: ${minutes} мин.`);
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
        `Интервал: ${formatReminderInterval(settings.reminderIntervalDays)}`,
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
    await ctx.reply(`Время напоминания установлено на ${settings.reminderTime}.`);
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
    const durationMinutes = await learningService.getSessionDurationMinutes(user.id);

    activeSessions.set(ctx.from.id, createLearningSession(durationMinutes));
    activeItems.delete(ctx.from.id);

    await sendNextLearningItem(ctx, learningService, activeItems, activeSessions, {
      leadText: `Начинаем занятие на ${durationMinutes} мин. Пиши перевод сообщением, а если не знаешь слово или фразу, нажимай кнопку ниже.`,
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
    await showSettingsPanel(ctx, learningService, "home");
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
    await showSettingsPanel(ctx, learningService, "home", true);
  });

  bot.action("settings:section:study", async (ctx) => {
    await showSettingsPanel(ctx, learningService, "study", true);
  });

  bot.action("settings:section:reminder", async (ctx) => {
    await showSettingsPanel(ctx, learningService, "reminder", true);
  });

  bot.action(/^settings:goal:(5|10|15)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const minutes = Number.parseInt(ctx.match[1], 10);
    await learningService.updateDailyGoal(user.id, minutes);
    await ctx.answerCbQuery(`Время обучения: ${minutes} мин.`);
    await showSettingsPanel(ctx, learningService, "study", true);
  });

  bot.action("settings:reminder:prompt_time", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    pendingInputs.set(ctx.from.id, { kind: "reminder_time" });
    await ctx.answerCbQuery("Отправь время в формате HH:MM");
    await showSettingsPanel(ctx, learningService, "reminder", true, true);
  });

  bot.action(/^settings:interval:(1|2|3)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const intervalDays = Number.parseInt(ctx.match[1], 10);
    await learningService.updateReminderInterval(user.id, intervalDays);
    await ctx.answerCbQuery(`Интервал обновлен: ${formatReminderInterval(intervalDays)}`);
    await showSettingsPanel(ctx, learningService, "reminder", true);
  });

  bot.action("settings:reminder:off", async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    pendingInputs.delete(ctx.from.id);
    await learningService.disableReminder(user.id);
    await ctx.answerCbQuery("Напоминания выключены.");
    await showSettingsPanel(ctx, learningService, "reminder", true);
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
      pendingInputs.delete(ctx.from.id);
      return next();
    }

    const pendingInput = pendingInputs.get(ctx.from.id);

    if (pendingInput?.kind === "reminder_time") {
      const reminderTime = parseReminderTime(text);

      if (!reminderTime) {
        await ctx.reply("Некорректное время. Отправь время в формате HH:MM, например 20:30");
        return;
      }

      const user = await learningService.ensureUser(ctx.from);
      pendingInputs.delete(ctx.from.id);
      await learningService.setReminder(user.id, reminderTime);
      await ctx.reply(`Время напоминания установлено на ${reminderTime}.`);
      await showSettingsPanel(ctx, learningService, "reminder");
      return;
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

function createLearningSession(durationMinutes: number): LearningSession {
  const startedAt = Date.now();

  return {
    durationMinutes,
    answeredCards: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
    startedAt,
    endsAt: startedAt + durationMinutes * 60 * 1000,
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
      "Сессия не активна. Нажми «Учить сербский», чтобы начать новое занятие.",
    ]));
    await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
    return;
  }

  if (session.answeredCards > 0 && Date.now() >= session.endsAt) {
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
    createLearningCardKeyboard(getLearningItemKey(nextItem), nextItem.kind),
  );

  activeItems.set(ctx.from.id, {
    item: nextItem,
    promptMessageId: sentMessage.message_id,
  });

  await safeDeleteMessages(ctx, options.cleanupMessageIds ?? []);
}

async function showSettingsPanel(
  ctx: Context,
  learningService: LearningService,
  section: SettingsSection,
  replaceMessage = false,
  awaitingTimeInput = false,
): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const settings = await learningService.getUserSettings(user.id);
  const text = formatSettingsPanel(section, settings, awaitingTimeInput);
  const keyboard = section === "home"
    ? createSettingsHomeKeyboard()
    : section === "study"
      ? createStudyTimeKeyboard(settings)
      : createReminderSettingsKeyboard(settings);

  if (replaceMessage && canEditMessageText(ctx)) {
    await ctx.editMessageText(text, keyboard);
    return;
  }

  await ctx.reply(text, keyboard);
}

function formatPromptItem(item: LearningItem, session: LearningSession): string {
  const remainingMinutes = Math.max(1, Math.ceil((session.endsAt - Date.now()) / 60000));

  if (item.kind === "word") {
    return [
      `Режим: ${session.durationMinutes} мин.`,
      `Осталось: примерно ${remainingMinutes} мин.`,
      `Слово: ${item.serbianLatin}`,
      "Напиши перевод на русский сообщением. Если не знаешь слово, нажми кнопку ниже.",
    ].join("\n");
  }

  return [
    `Режим: ${session.durationMinutes} мин.`,
    `Осталось: примерно ${remainingMinutes} мин.`,
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
  const actualDurationMinutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));

  return [
    interrupted ? "Занятие остановлено." : "Занятие завершено.",
    `Время обучения: ${session.durationMinutes} мин.`,
    `Отвечено элементов: ${session.answeredCards}`,
    `Верных ответов: ${session.correctAnswers}`,
    `На повторение: ${session.wrongAnswers}`,
    `Точность: ${accuracy}%`,
    `Фактическая длительность: около ${actualDurationMinutes} мин.`,
  ].join("\n");
}

function formatSettingsPanel(
  section: SettingsSection,
  settings: LearningSettings,
  awaitingTimeInput: boolean,
): string {
  if (section === "study") {
    return [
      "Изменить время обучения:",
      `Сейчас: ${settings.dailyGoalMinutes} мин.`,
      "Выбери удобную длительность занятия кнопками ниже.",
    ].join("\n");
  }

  if (section === "reminder") {
    return [
      "Настроить напоминание:",
      `Текущее время: ${settings.reminderTime ?? "не задано"}`,
      `Интервал: ${formatReminderInterval(settings.reminderIntervalDays)}`,
      awaitingTimeInput
        ? "Теперь отправь время сообщением в формате HH:MM, например 20:30."
        : "Ниже можно задать время, выбрать интервал или выключить напоминания.",
    ].join("\n");
  }

  return [
    "Настройки обучения:",
    `Время обучения: ${settings.dailyGoalMinutes} мин.`,
    `Напоминание: ${settings.reminderTime ?? "выключено"}`,
    `Интервал: ${formatReminderInterval(settings.reminderIntervalDays)}`,
    `Часовой пояс: ${settings.timezone}`,
    "Открой нужный раздел кнопками ниже.",
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

function formatReminderInterval(intervalDays: number): string {
  if (intervalDays === 1) {
    return "каждый день";
  }

  return `раз в ${intervalDays} дня`;
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
