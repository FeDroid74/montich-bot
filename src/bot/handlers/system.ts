import type { Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { createMainMenuKeyboard } from "../keyboards/main-menu.js";

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  bot.start(async (ctx) => {
    await ctx.reply(
      "Бот Montich запущен. Базовая архитектура готова, дальше будем постепенно добавлять функции.",
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
}
