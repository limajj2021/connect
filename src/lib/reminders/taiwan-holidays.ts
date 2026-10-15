import { Lunar } from "lunar-javascript";

/** An owner-editable greeting occasion: a yearly date (lunar or solar) to send a greeting for. */
export interface GreetingOccasion {
  id: string;
  name: string;
  calendar: "lunar" | "solar";
  month: number;
  day: number;
  lead_days: number;
  enabled: boolean;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Returns the Gregorian (solar) date of an occasion for a given solar year,
 * as "YYYY-MM-DD". A lunar occurrence (e.g. 農曆正月初一) is always the
 * non-leap-month occurrence by convention.
 */
export function occasionSolarDate(occasion: Pick<GreetingOccasion, "calendar" | "month" | "day">, solarYear: number): string {
  if (occasion.calendar === "solar") return `${solarYear}-${pad2(occasion.month)}-${pad2(occasion.day)}`;
  const lunar = Lunar.fromYmd(solarYear, occasion.month, occasion.day);
  return lunar.getSolar().toYmd();
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the reminder due date (occasion date minus lead days) for an
 * occasion occurring in `solarYear`. A lunar occasion can roll its solar date
 * into January, so callers generating a full year's reminders should also
 * check the surrounding years.
 */
export function occasionReminderDueDate(occasion: GreetingOccasion, solarYear: number): { festivalDate: string; dueDate: string } {
  const festivalDate = occasionSolarDate(occasion, solarYear);
  return { festivalDate, dueDate: addDays(festivalDate, -occasion.lead_days) };
}
