import { Markup } from "telegraf";

export function createKnowledgeChoiceKeyboard(wordId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Я знаю это слово", `learn:mode:known:${wordId}`)],
    [Markup.button.callback("Я не знаю этого слова", `learn:mode:unknown:${wordId}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}

export function createAwaitingTranslationKeyboard(wordId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Я не знаю этого слова", `learn:mode:unknown:${wordId}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}
