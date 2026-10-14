import { FESTIVAL_LABELS } from "./taiwan-holidays";
import type { FestivalKey, ReminderType } from "@/types/database";

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  festival: "節日提醒",
  birthday: "生日提醒",
  custom: "自訂提醒",
  meeting_followup: "會議後續待辦",
};

export function reminderTitle(reminder: { reminder_type: ReminderType; festival_key: FestivalKey | null }) {
  if (reminder.reminder_type === "festival" && reminder.festival_key) {
    return `${FESTIVAL_LABELS[reminder.festival_key]}提醒`;
  }
  return REMINDER_TYPE_LABELS[reminder.reminder_type] ?? "提醒";
}
