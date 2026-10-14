import { addDays } from "@/lib/format-date";

import { normalizeText } from "./extract";

const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Finds a due date in a short Chinese phrase ("明天", "下週三", "10/20",
 * "3天後", "2026-11-01") relative to `today` (YYYY-MM-DD, Taipei), and returns
 * it together with the text minus the date words.
 */
export function extractDueDate(input: string, today: string): { date?: string; rest: string } {
  const text = normalizeText(input);
  const patterns: [RegExp, (m: RegExpMatchArray) => string | undefined][] = [
    [/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日號号]?/, (m) => `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`],
    [
      /(?<!\d)(\d{1,2})\s*[/月]\s*(\d{1,2})\s*[日號号]?(?!\d)/,
      (m) => {
        const year = Number(today.slice(0, 4));
        const candidate = `${year}-${pad2(+m[1])}-${pad2(+m[2])}`;
        // A date already passed this year most likely means next year.
        return candidate < today ? `${year + 1}-${pad2(+m[1])}-${pad2(+m[2])}` : candidate;
      },
    ],
    [/大後天/, () => addDays(today, 3)],
    [/後天/, () => addDays(today, 2)],
    [/明天|明日/, () => addDays(today, 1)],
    [/今天|今日|今晚/, () => today],
    [/(\d{1,3})\s*天[後后]/, (m) => addDays(today, Number(m[1]))],
    [/(\d{1,2})\s*(?:週|周|星期)[後后]/, (m) => addDays(today, Number(m[1]) * 7)],
    [
      /下(?:週|周|星期|禮拜)([一二三四五六日天])/,
      (m) => {
        const target = WEEKDAYS[m[1]];
        const current = weekdayOf(today);
        const daysToNextMonday = ((8 - current) % 7) || 7;
        const nextMonday = addDays(today, daysToNextMonday);
        return addDays(nextMonday, (target + 6) % 7);
      },
    ],
    [
      /(?:這|本)?(?:週|周|星期|禮拜)([一二三四五六日天])/,
      (m) => {
        const target = WEEKDAYS[m[1]];
        const diff = (target - weekdayOf(today) + 7) % 7;
        return addDays(today, diff);
      },
    ],
  ];

  for (const [re, toDate] of patterns) {
    const match = text.match(re);
    if (!match) continue;
    const date = toDate(match);
    if (!date || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) continue;
    const rest = text.replace(match[0], " ").replace(/\s+/g, " ").trim();
    return { date, rest };
  }
  return { rest: text.trim() };
}

/** "2026-10-20" → "10/20（二）" */
export function formatShortDate(ymd: string): string {
  const names = ["日", "一", "二", "三", "四", "五", "六"];
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}（${names[weekdayOf(ymd)]}）`;
}

/** Whole days from `today` to `ymd` (negative = past). */
export function daysBetween(today: string, ymd: string): number {
  return Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
