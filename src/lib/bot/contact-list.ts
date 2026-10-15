/**
 * Recognises a screenshot of a LINE chat list or friend list from OCR line
 * positions, and returns the display name of every person in it — so one
 * screenshot can create many contacts. Pure geometry + rules, no AI:
 *
 *   [avatar]  Kenny 李副 @班加羅爾*            Yesterday   ← name row (+ date on the right)
 *             Call time 1:00                               ← preview / status message
 *
 * Names in such a list share one left edge (the column right of the avatars),
 * and each row is separated from the next by a gap bigger than a line.
 */

export interface OcrLine {
  text: string;
  left: number;
  top: number;
  height: number;
  right: number;
}

export interface ContactList {
  kind: "chats" | "friends";
  names: string[];
}

// Right-hand time labels of a chat list: "Yesterday", "星期二", "10/6", "11:09 AM"…
const DATE_LABEL_RE =
  /^(?:yesterday|today|昨天|今天|前天|星期[一二三四五六日天]|[週周][一二三四五六日天]|(?:mon|tues|wednes|thurs|fri|satur|sun)day|mon|tue|wed|thu|fri|sat|sun|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}月\d{1,2}日|(?:上午|下午|午前|午後)?\s*\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?)$/i;
// "(4)" member count next to a group chat's name.
const GROUP_COUNT_RE = /^[(（]\d{1,4}[)）]$/;
// List headings and tabs that share the name column on some screens.
const LIST_UI_RE =
  /^(?:chats?|聊天|好友|friends?|groups?|群組|favorites?|我的最愛|最愛|official accounts?|官方帳號|search|搜尋|my profile|個人檔案|birthdays?|生日|recently added|最近新增|services?|服務|home|主頁|news|新聞|wallet|錢包|keep|筆記|notes?|all|全部|unread|未讀)\s*\d*$/i;
const SENTENCE_END_RE = /[。！？!?]$/;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

function cleanName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > 50) return null;
  if (LIST_UI_RE.test(name) || DATE_LABEL_RE.test(name) || SENTENCE_END_RE.test(name)) return null;
  if (!/[\p{L}]/u.test(name)) return null; // digits / symbols only
  return name;
}

export function detectContactList(lines: OcrLine[]): ContactList | null {
  const usable = lines.filter((l) => l.text.trim() && l.height > 0);
  if (usable.length < 4) return null;
  const width = Math.max(...usable.map((l) => l.right));
  const isDate = (l: OcrLine) => DATE_LABEL_RE.test(l.text.trim()) && l.left > width * 0.6;
  const dates = usable.filter(isDate);
  const counts = usable.filter((l) => GROUP_COUNT_RE.test(l.text.trim()));
  const candidates = usable.filter((l) => !isDate(l) && !GROUP_COUNT_RE.test(l.text.trim()));

  // The name column: the left edge shared by the most lines.
  const tolerance = Math.max(width * 0.02, 6);
  let columnLeft = 0;
  let best = 0;
  for (const line of candidates) {
    const n = candidates.filter((other) => Math.abs(other.left - line.left) <= tolerance).length;
    if (n > best) [best, columnLeft] = [n, line.left];
  }
  if (best < 3) return null;
  const column = candidates
    .filter((l) => Math.abs(l.left - columnLeft) <= tolerance)
    .sort((a, b) => a.top - b.top);

  // Lines close together belong to one row (name + preview); a gap starts the next.
  const rows: OcrLine[][] = [];
  for (const line of column) {
    const current = rows.at(-1);
    const previous = current?.at(-1);
    if (!current || !previous || line.top - (previous.top + previous.height) > 0.45 * Math.min(previous.height, line.height)) {
      rows.push([line]);
    } else {
      current.push(line);
    }
  }
  if (rows.length < 2) return null;

  const near = (a: OcrLine, b: OcrLine) => Math.abs(a.top - b.top) <= Math.max(a.height, b.height) * 1.2;
  const rowInfo = rows.map((row) => {
    const head = row[0];
    const bottom = Math.max(...row.map((l) => l.top + l.height));
    const isGroup =
      /[,，]/.test(head.text) ||
      /[(（]\d{1,4}[)）]\s*$/.test(head.text) ||
      counts.some((c) => c.top >= head.top - head.height && c.top <= bottom);
    return { head, isGroup, dated: dates.some((d) => near(d, head)) };
  });

  const datedRows = rowInfo.filter((r) => r.dated).length;
  let kind: ContactList["kind"] | null = null;
  if (datedRows >= 2 && datedRows * 2 >= rows.length) {
    kind = "chats";
  } else if (rows.length >= 4) {
    // Friend list: no dates, but rows are evenly spaced and taller than a line (avatars).
    const tops = rowInfo.map((r) => r.head.top);
    const pitches = tops.slice(1).map((top, i) => top - tops[i]);
    const pitch = median(pitches);
    const lineHeight = median(rowInfo.map((r) => r.head.height));
    const regular = pitches.filter((p) => Math.abs(p - pitch) <= pitch * 0.25).length;
    if (pitch >= lineHeight * 1.8 && regular >= pitches.length * 0.75) kind = "friends";
  }
  if (!kind) return null;

  const names: string[] = [];
  for (const row of rowInfo) {
    if (row.isGroup) continue;
    const name = cleanName(row.head.text);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.length >= 2 ? { kind, names } : null;
}
