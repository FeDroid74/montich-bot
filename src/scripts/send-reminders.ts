import { Telegraf } from "telegraf";
import { createMainMenuKeyboard } from "../bot/keyboards/main-menu.js";
import { appConfig } from "../config/app-config.js";
import { createDatabaseAdapter } from "../database/database.js";
import { LearningService } from "../learning/service.js";

async function main(): Promise<void> {
  const database = createDatabaseAdapter(appConfig.database);

  if (!database.isConfigured()) {
    throw new Error("DATABASE_URL не задана. Напоминания нельзя отправить без подключения к PostgreSQL.");
  }

  const bot = new Telegraf(appConfig.bot.token);
  const service = new LearningService(database, appConfig.bot.adminTelegramId);
  const now = new Date();

  try {
    await database.initialize();
    const recipients = await service.getReminderRecipients(now);

    if (recipients.length === 0) {
      console.log("Подходящих напоминаний на текущую минуту нет.");
      return;
    }

    for (const recipient of recipients) {
      const studyMinutes = recipient.dailyGoalMinutes;
      const intervalText = recipient.reminderIntervalDays === 1
        ? "каждый день"
        : `раз в ${recipient.reminderIntervalDays} дня`;

      await bot.telegram.sendMessage(
        recipient.telegramId,
        [
          "Ежедневное напоминание по сербскому.",
          `Время обучения: ${studyMinutes} мин.`,
          `Интервал: ${intervalText}.`,
          "Открой бота и нажми «Учить сербский».",
        ].join("\n"),
        {
          reply_markup: createMainMenuKeyboard().reply_markup,
        },
      );

      await service.markReminderSent(recipient.userId, now);
      console.log(`Отправлено напоминание пользователю ${recipient.telegramId}`);
    }
  } finally {
    await database.close();
  }
}

void main().catch((error) => {
  console.error("Отправка напоминаний завершилась ошибкой.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
