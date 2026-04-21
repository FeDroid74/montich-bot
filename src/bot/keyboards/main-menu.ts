import { Markup } from "telegraf";

export const MAIN_MENU_BUTTONS = {
  learnSerbian: "Учить сербский",
  faq: "FAQ",
  progress: "Мой прогресс",
  donate: "Поддержать проект",
} as const;

export function createMainMenuKeyboard() {
  return Markup.keyboard([
    [MAIN_MENU_BUTTONS.learnSerbian, MAIN_MENU_BUTTONS.faq],
    [MAIN_MENU_BUTTONS.progress, MAIN_MENU_BUTTONS.donate],
  ]).resize();
}
