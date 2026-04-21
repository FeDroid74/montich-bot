import { Markup, Telegraf } from "telegraf";
import { appConfig } from "./config.js";

const bot = new Telegraf(appConfig.botToken);

bot.start(async (ctx) => {
  await ctx.reply(
    "Montich bot initialized. MVP modules will be added step by step.",
    Markup.keyboard([
      ["Uciti srpski", "FAQ"],
      ["Moj progres", "Podrzati projekat"],
    ]).resize(),
  );
});

bot.command("health", async (ctx) => {
  await ctx.reply("Bot process is healthy.");
});

bot.catch((error) => {
  console.error("Unhandled bot error", error);
});

async function main(): Promise<void> {
  await bot.launch();
  console.log("Montich bot started.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

void main();
