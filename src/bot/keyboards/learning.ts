import { Markup } from "telegraf";

export function createLearningCardKeyboard(wordId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Я не знаю этого слова", `learn:mode:unknown:${wordId}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}
