import { Markup } from "telegraf";

export function createMainMenuKeyboard() {
  return Markup.keyboard([
    ["Uciti srpski", "FAQ"],
    ["Moj progres", "Podrzati projekat"],
  ]).resize();
}
