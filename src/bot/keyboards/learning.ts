import { Markup } from "telegraf";

export function createLearningCardKeyboard(itemKey: string, itemKind: "word" | "phrase") {
  const unknownLabel = itemKind === "word" ? "Я не знаю это слово" : "Я не знаю эту фразу";

  return Markup.inlineKeyboard([
    [Markup.button.callback(unknownLabel, `learn:unknown:${itemKey}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}
