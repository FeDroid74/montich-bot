import { Markup } from "telegraf";

export const MAIN_MENU_BUTTONS = {
  learnSerbian: "Учить сербский",
  progress: "Мой прогресс",
  phrases: "Мои фразы",
  settings: "Настройки",
  faq: "FAQ",
  donate: "Поддержать проект",
  adminDictionary: "Админ словарь",
} as const;

export function createMainMenuKeyboard(isAdmin = false) {
  const rows: string[][] = [
    [MAIN_MENU_BUTTONS.learnSerbian, MAIN_MENU_BUTTONS.progress],
    [MAIN_MENU_BUTTONS.phrases, MAIN_MENU_BUTTONS.settings],
    [MAIN_MENU_BUTTONS.faq, MAIN_MENU_BUTTONS.donate],
  ];

  if (isAdmin) {
    rows.splice(2, 0, [MAIN_MENU_BUTTONS.adminDictionary]);
  }

  return Markup.keyboard(rows).resize();
}
