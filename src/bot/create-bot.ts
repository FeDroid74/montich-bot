import { Telegraf } from "telegraf";
import type { AppContext } from "../app/context.js";
import { registerSystemHandlers } from "./handlers/system.js";

export function createBot(context: AppContext): Telegraf {
  const bot = new Telegraf(context.config.bot.token);

  registerSystemHandlers(bot, context);

  bot.catch((error) => {
    console.error("Unhandled bot error", error);
  });

  return bot;
}
