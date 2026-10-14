/**
 * All timestamps in this app represent Taiwan activity (LINE chats, imports,
 * meetings), so they're always displayed in Asia/Taipei time — never the
 * viewer's own browser/server timezone, which on Vercel's Node runtime (or a
 * browser outside Taiwan) would otherwise silently shift displayed times.
 */
const TAIPEI_TZ = "Asia/Taipei";

export function formatTaipeiDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TAIPEI_TZ,
  });
}

export function formatTaipeiDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TAIPEI_TZ,
  });
}

export function formatTaipeiTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TAIPEI_TZ,
  });
}

/** Today's calendar date in Taiwan as "YYYY-MM-DD" (en-CA formats as ISO). */
export function taipeiToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TAIPEI_TZ });
}

/** Adds whole days to a "YYYY-MM-DD" date string. */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
