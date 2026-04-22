import { Markup } from "telegraf";

export function createLearningCardKeyboard(itemKey: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Я не знаю этого слова", `learn:unknown:${itemKey}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}
