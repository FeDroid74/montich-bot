import type { Context, Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { LearningService, type LearningAnswer } from "../../learning/service.js";
import { createAnswerKeyboard, createRevealTranslationKeyboard } from "../keyboards/learning.js";
import { MAIN_MENU_BUTTONS, createMainMenuKeyboard } from "../keyboards/main-menu.js";

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  const learningService = new LearningService(context.database, context.config.bot.adminTelegramId);

  bot.start(async (ctx) => {
    if (ctx.from) {
      await learningService.ensureUser(ctx.from);
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
    await sendNextLearningCard(ctx, learningService);
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

    const user = await learningService.ensureUser(ctx.from);
    const nextCard = await learningService.getNextCard(user.id);
    const wordId = Number.parseInt(ctx.match[1], 10);

    if (!nextCard || nextCard.wordId !== wordId) {
      await ctx.answerCbQuery("Карточка устарела. Открой новую.");
      return;
    }

    await ctx.editMessageText(
      formatLearningCard(nextCard.serbianLatin, nextCard.russianTranslation),
      createAnswerKeyboard(nextCard.wordId),
    );
  });

  bot.action(/^learn:rate:(\d+):(known|again)$/, async (ctx) => {
    if (!ctx.from) {
      return;
    }

    const user = await learningService.ensureUser(ctx.from);
    const wordId = Number.parseInt(ctx.match[1], 10);
    const answer = ctx.match[2] as LearningAnswer;

    await learningService.registerAnswer(user.id, wordId, answer);
    await ctx.answerCbQuery(answer === "known" ? "Сохранил как знакомое слово." : "Отмечено на повторение.");
    await safelyRemoveInlineKeyboard(ctx);
    await sendNextLearningCard(ctx, learningService);
  });

  bot.action("learn:stop", async (ctx) => {
    await ctx.answerCbQuery("Сессию остановил.");
    await safelyRemoveInlineKeyboard(ctx);
    await ctx.reply("Сессию завершил. Когда будешь готов, снова нажми «Учить сербский».");
  });
}

async function sendNextLearningCard(ctx: Context, learningService: LearningService): Promise<void> {
  if (!ctx.from) {
    return;
  }

  const user = await learningService.ensureUser(ctx.from);
  const nextCard = await learningService.getNextCard(user.id);

  if (!nextCard) {
    await ctx.reply("Слова для обучения пока закончились. Позже добавим больше карточек и повторения по расписанию.");
    return;
  }

  await ctx.reply(
    formatPromptCard(nextCard.serbianLatin),
    createRevealTranslationKeyboard(nextCard.wordId),
  );
}

function formatPromptCard(serbianLatin: string): string {
  return [
    "Карточка",
    `Сербский: ${serbianLatin}`,
    "Попробуй вспомнить перевод на русский и затем открой ответ.",
  ].join("\n");
}

function formatLearningCard(serbianLatin: string, russianTranslation: string): string {
  return [
    "Карточка",
    `Сербский: ${serbianLatin}`,
    `Перевод: ${russianTranslation}`,
    "Оцени, насколько уверенно ты знаешь это слово.",
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
