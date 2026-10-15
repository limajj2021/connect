/**
 * 溝通節點: the handful of moments in a chat worth remembering ("10/02 他說
 * 下個月要搬去新竹", "10/05 我答應幫他介紹工程師"), pulled out of an imported
 * or forwarded chat by a free AI model. This file is the pure part — building
 * the transcript the model reads and validating what it sends back — so it
 * can be tested without a model.
 */

export interface ChatLine {
  /** YYYY-MM-DD, or null when unknown (forwarded messages carry no date). */
  date: string | null;
  /** Display name of who said it; "我" for the owner, null when unknown. */
  speaker: string | null;
  text: string;
}

export interface Milestone {
  date: string;
  /** "我", one of the chat's speakers, or "" when unknown. */
  who: string;
  point: string;
}

export interface ChatPromise {
  text: string;
  due: string | null;
}

export interface MilestoneResult {
  milestones: Milestone[];
  promises: ChatPromise[];
}

const MAX_LINE_CHARS = 200;
export const MAX_MILESTONES = 8;
const MAX_PROMISES = 5;

/**
 * The transcript the model reads: "10-02 王小明：…", newest messages kept
 * when it's too long (what was said recently matters most for the next chat).
 */
export function buildTranscript(lines: ChatLine[], maxChars = 12_000) {
  const rendered: string[] = [];
  let used = 0;
  let firstDate: string | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const body = line.text.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);
    if (!body) continue;
    const prefix = [line.date ? line.date.slice(5) : null, line.speaker ? `${line.speaker}：` : null].filter(Boolean).join(" ");
    const entry = prefix ? `${prefix}${line.speaker ? "" : " "}${body}` : body;
    if (used + entry.length + 1 > maxChars) break;
    rendered.push(entry);
    used += entry.length + 1;
    if (line.date) firstDate = line.date;
  }
  const dates = lines.map((l) => l.date).filter((d): d is string => Boolean(d));
  return {
    transcript: rendered.reverse().join("\n"),
    firstDate,
    lastDate: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null,
    truncated: rendered.length < lines.filter((l) => l.text.trim()).length,
  };
}

export function milestonePrompt(opts: { transcript: string; contactNames: string[]; isGroup: boolean; year: string; datesKnown: boolean }) {
  const who = opts.isGroup
    ? `這是群組對話，成員有：${opts.contactNames.join("、")}；「我」是我自己。`
    : opts.contactNames.length > 0
      ? `這是我（「我」）跟 ${opts.contactNames[0]} 的一對一對話。`
      : "這是我跟一位朋友的對話（轉傳的訊息，不知道每句是誰說的）。";
  return [
    who,
    "請從對話中挑出之後再聊天時值得記得、可以延續的「溝通節點」，例如：對方的近況與人生大事、計畫、煩惱、需要的幫忙、我們做的決定、約好的事。",
    "略過寒暄、貼圖、單純的「好」「謝謝」。",
    `最多 ${MAX_MILESTONES} 個節點，每個一句話（30 字以內），用「他」或對方名字稱呼對方、用「我」稱呼我自己。`,
    "另外列出「我答應對方要做、但還沒做」的事（沒有就給空陣列）。",
    opts.datesKnown
      ? `日期用 YYYY-MM-DD（對話裡的日期是 MM-DD，年份大多是 ${opts.year}）。`
      : "這段對話沒有日期，date 一律填 null。",
    "只輸出 JSON，不要任何說明，格式：",
    '{"milestones":[{"date":"2026-10-02","who":"說話的人（我／對方名字）","point":"一句話重點"}],"promises":[{"text":"我要做的事","due":"YYYY-MM-DD 或 null"}]}',
    "",
    "對話：",
    opts.transcript,
  ].join("\n");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Validates the model's JSON: drops empty / Simplified-Chinese points, clamps
 * dates to the chat's own range (a model sometimes invents a year), and caps
 * the counts. Points are kept in date order.
 */
export function parseMilestoneReply(
  json: unknown,
  opts: { fallbackDate: string; minDate: string | null; maxDate: string | null; isSimplified: (text: string) => boolean },
): MilestoneResult {
  const root = (json && typeof json === "object" ? json : {}) as { milestones?: unknown; promises?: unknown };
  const fixDate = (value: unknown) => {
    const date = typeof value === "string" && DATE_RE.test(value) ? value : null;
    if (!date) return opts.maxDate ?? opts.fallbackDate;
    if (opts.minDate && date < opts.minDate) return opts.minDate;
    if (opts.maxDate && date > opts.maxDate) return opts.maxDate;
    if (!opts.maxDate && date > opts.fallbackDate) return opts.fallbackDate;
    return date;
  };

  const seen = new Set<string>();
  const milestones = (Array.isArray(root.milestones) ? root.milestones : [])
    .map((m) => {
      const item = (m ?? {}) as Record<string, unknown>;
      return { date: fixDate(item.date), who: clean(item.who, 30), point: clean(item.point, 80) };
    })
    .filter((m) => m.point && !opts.isSimplified(m.point) && !seen.has(m.point) && seen.add(m.point))
    .slice(0, MAX_MILESTONES)
    .sort((a, b) => a.date.localeCompare(b.date));

  const promises = (Array.isArray(root.promises) ? root.promises : [])
    .map((p) => {
      const item = (p ?? {}) as Record<string, unknown>;
      const due = typeof item.due === "string" && DATE_RE.test(item.due) && item.due >= opts.fallbackDate ? item.due : null;
      return { text: clean(item.text, 80), due };
    })
    .filter((p) => p.text && !opts.isSimplified(p.text))
    .slice(0, MAX_PROMISES);

  return { milestones, promises };
}
