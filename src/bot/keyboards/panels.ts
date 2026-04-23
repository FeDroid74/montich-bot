import { Markup } from "telegraf";

export function createSettingsPanelKeyboard(settings: {
  dailyGoalMinutes: number;
  reminderTime: string | null;
}) {
  const goalFiveLabel = settings.dailyGoalMinutes === 5 ? "• Цель 5 мин" : "Цель 5 мин";
  const goalTenLabel = settings.dailyGoalMinutes === 10 ? "• Цель 10 мин" : "Цель 10 мин";
  const reminderTwentyLabel = settings.reminderTime === "20:00" ? "• Напоминание 20:00" : "Напоминание 20:00";
  const reminderTwentyOneLabel = settings.reminderTime === "21:00" ? "• Напоминание 21:00" : "Напоминание 21:00";

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(goalFiveLabel, "settings:goal:5"),
      Markup.button.callback(goalTenLabel, "settings:goal:10"),
    ],
    [
      Markup.button.callback(reminderTwentyLabel, "settings:reminder:20:00"),
      Markup.button.callback(reminderTwentyOneLabel, "settings:reminder:21:00"),
    ],
    [Markup.button.callback("Выключить напоминания", "settings:reminder:off")],
    [Markup.button.callback("Обновить", "settings:show")],
  ]);
}

export function createAdminDictionaryPanelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Все слова", "admin:list:all"),
      Markup.button.callback("Активные", "admin:list:active"),
    ],
    [Markup.button.callback("Скрытые", "admin:list:hidden")],
  ]);
}
