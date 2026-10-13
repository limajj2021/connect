import { Lunar } from "lunar-javascript";

import type { FestivalKey } from "@/types/database";

// Lunar calendar date (month, day) for each festival. These are always the
// non-leap-month occurrence by convention (e.g. a leap 5th month does not get
// its own Dragon Boat Festival).
const FESTIVAL_LUNAR_DATE: Record<FestivalKey, [month: number, day: number]> = {
  chinese_new_year: [1, 1],
  dragon_boat: [5, 5],
  mid_autumn: [8, 15],
};

export const FESTIVAL_LABELS: Record<FestivalKey, string> = {
  chinese_new_year: "春節",
  dragon_boat: "端午節",
  mid_autumn: "中秋節",
};

export const FESTIVAL_DEFAULT_LEAD_DAYS: Record<FestivalKey, number> = {
  chinese_new_year: 14,
  dragon_boat: 7,
  mid_autumn: 7,
};

export const ALL_FESTIVAL_KEYS: FestivalKey[] = ["chinese_new_year", "dragon_boat", "mid_autumn"];

/** Returns the Gregorian (solar) date of a festival for a given solar year, as "YYYY-MM-DD". */
export function getFestivalSolarDate(festival: FestivalKey, solarYear: number): string {
  const [month, day] = FESTIVAL_LUNAR_DATE[festival];
  const lunar = Lunar.fromYmd(solarYear, month, day);
  return lunar.getSolar().toYmd();
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the reminder due date (festival date minus lead days) for a festival
 * occurring in `solarYear`. Since the lunar year can roll the solar date into
 * January, this also checks the surrounding year when the lead window would
 * otherwise miss a festival that falls very early in `solarYear`.
 */
export function getFestivalReminderDueDate(
  festival: FestivalKey,
  solarYear: number,
  leadDays: number = FESTIVAL_DEFAULT_LEAD_DAYS[festival],
): { festivalDate: string; dueDate: string } {
  const festivalDate = getFestivalSolarDate(festival, solarYear);
  return { festivalDate, dueDate: addDays(festivalDate, -leadDays) };
}
