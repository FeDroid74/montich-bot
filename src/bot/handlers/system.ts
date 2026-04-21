import type { Telegraf } from "telegraf";
import type { AppContext } from "../../app/context.js";
import { createMainMenuKeyboard } from "../keyboards/main-menu.js";

export function registerSystemHandlers(bot: Telegraf, context: AppContext): void {
  bot.start(async (ctx) => {
    await ctx.reply(
      "Montich bot initialized. Core architecture is ready for the next feature stages.",
      createMainMenuKeyboard(),
    );
  });

  bot.command("health", async (ctx) => {
    const databaseStatus = context.database.getStatus();

    await ctx.reply([
      "Bot process is healthy.",
      `Environment: ${context.config.runtimeEnvironment}`,
      `Database: ${databaseStatus.label}`,
    ].join("\n"));
  });
}
