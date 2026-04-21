import { Markup } from "telegraf";

export function createRevealTranslationKeyboard(wordId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Показать перевод", `learn:show:${wordId}`)],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}

export function createAnswerKeyboard(wordId: number) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Знаю", `learn:rate:${wordId}:known`),
      Markup.button.callback("Повторить", `learn:rate:${wordId}:again`),
    ],
    [Markup.button.callback("Закончить", "learn:stop")],
  ]);
}
