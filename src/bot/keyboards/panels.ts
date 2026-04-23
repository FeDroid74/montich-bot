import { Markup } from "telegraf";

export function createSettingsHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Изменить время обучения", "settings:section:study")],
    [Markup.button.callback("Настроить напоминание", "settings:section:reminder")],
    [Markup.button.callback("Обновить", "settings:show")],
  ]);
}

export function createStudyTimeKeyboard(settings: {
  dailyGoalMinutes: number;
}) {
  const labels = [5, 10, 15].map((minutes) => settings.dailyGoalMinutes === minutes ? `• ${minutes} мин` : `${minutes} мин`);

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(labels[0], "settings:goal:5"),
      Markup.button.callback(labels[1], "settings:goal:10"),
      Markup.button.callback(labels[2], "settings:goal:15"),
    ],
    [Markup.button.callback("Назад", "settings:show")],
  ]);
}

export function createReminderSettingsKeyboard(settings: {
  reminderTime: string | null;
  reminderIntervalDays: number;
}) {
  const intervalOne = settings.reminderIntervalDays === 1 ? "• Каждый день" : "Каждый день";
  const intervalTwo = settings.reminderIntervalDays === 2 ? "• Раз в 2 дня" : "Раз в 2 дня";
  const intervalThree = settings.reminderIntervalDays === 3 ? "• Раз в 3 дня" : "Раз в 3 дня";

  return Markup.inlineKeyboard([
    [Markup.button.callback("Указать время", "settings:reminder:prompt_time")],
    [
      Markup.button.callback(intervalOne, "settings:interval:1"),
      Markup.button.callback(intervalTwo, "settings:interval:2"),
      Markup.button.callback(intervalThree, "settings:interval:3"),
    ],
    [Markup.button.callback("Выключить напоминания", "settings:reminder:off")],
    [Markup.button.callback("Назад", "settings:show")],
  ]);
}

export function createAdminDictionaryPanelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Активные", "admin:list:active"),
      Markup.button.callback("Скрытые", "admin:list:hidden"),
    ],
    [Markup.button.callback("Все слова", "admin:list:all")],
  ]);
}
