import { Markup } from "telegraf";

export function createMainMenuKeyboard() {
  return Markup.keyboard([
    ["Учить сербский", "FAQ"],
    ["Мой прогресс", "Поддержать проект"],
  ]).resize();
}
