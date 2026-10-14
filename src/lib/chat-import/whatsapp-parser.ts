/**
 * Parser for WhatsApp's "Export chat" .txt (the `_chat.txt` inside the zip on
 * iOS, or `WhatsApp Chat with X.txt` on Android). Lines look like
 *   iOS:     [2026/10/14 上午9:05:12] Kenny: hello
 *            [14/10/2026, 09:05:12] Kenny: hello
 *   Android: 10/14/26, 9:05 AM - Kenny: hello
 * Continuation lines belong to the previous message. Produces the same
 * ParsedChat shape as the LINE parser so the import pipeline is shared.
 */
import { fnv1a, type ParsedChat, type ParsedMessage, type ParsedMessageType } from "./line-parser";

const INVISIBLE_RE = /[‎‏‪-‮﻿]/g;
// [date, time] … or date, time - …
const IOS_RE = /^\[([^\]]+?)[,\s]+((?:上午|下午)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?)\]\s(.*)$/;
const ANDROID_RE = /^(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})[,\s]+((?:上午|下午)?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?)\s[-–]\s(.*)$/;

interface RawLine {
  dateText: string;
  timeText: string;
  rest: string;
  lineNo: number;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function splitDate(text: string): number[] | null {
  const parts = text.match(/\d+/g);
  return parts && parts.length === 3 ? parts.map(Number) : null;
}

/** Decides once per file whether dates are Y/M/D, D/M/Y or M/D/Y. */
function detectDateOrder(dates: number[][]): "ymd" | "dmy" | "mdy" {
  if (dates.some((d) => d[0] > 31)) return "ymd";
  if (dates.some((d) => d[0] > 12)) return "dmy";
  if (dates.some((d) => d[1] > 12)) return "mdy";
  return "mdy";
}

function toIsoDate(parts: number[], order: "ymd" | "dmy" | "mdy"): string | null {
  const [rawYear, m, d] = order === "ymd" ? parts : order === "dmy" ? [parts[2], parts[1], parts[0]] : [parts[2], parts[0], parts[1]];
  const y = rawYear < 100 ? rawYear + 2000 : rawYear;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function toTime(text: string): string {
  const match = text.match(/(上午|下午)?\s*(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";
  let hour = Number(match[2]);
  const pm = match[1] === "下午" || /p\.?m/i.test(text);
  const am = match[1] === "上午" || /a\.?m/i.test(text);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return `${pad2(hour)}:${match[3]}`;
}

function classify(sender: string | null, text: string): ParsedMessageType {
  if (sender === null) return "system";
  const t = text.trim();
  if (/end-to-end encrypted|端對端加密/i.test(t)) return "system";
  if (/^<?(?:Media omitted|媒體已略去|附件已省略)>?$/i.test(t)) return "file";
  if (/(?:image|圖片|照片) omitted|^<附件：.+\.(?:jpe?g|png|webp|heic)>$/i.test(t)) return "image";
  if (/(?:video|影片) omitted|^<附件：.+\.(?:mp4|mov)>$/i.test(t)) return "video";
  if (/(?:audio|語音) omitted|^<附件：.+\.(?:opus|m4a|mp3)>$/i.test(t)) return "audio";
  if (/sticker omitted|貼圖已略去/i.test(t)) return "sticker";
  if (/(?:document|文件) omitted|^<附件：/i.test(t)) return "file";
  if (/^(?:Missed (?:voice|video) call|未接來電)/i.test(t)) return "call";
  return "text";
}

/** True when the text looks like a WhatsApp export (≥ 2 lines in its timestamp format). */
export function looksLikeWhatsAppExport(raw: string): boolean {
  let hits = 0;
  for (const line of raw.replace(INVISIBLE_RE, "").split(/\r?\n/).slice(0, 50)) {
    if (IOS_RE.test(line) || ANDROID_RE.test(line)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}

export function parseWhatsAppChatExport(raw: string, chatNameHint: string | null = null): ParsedChat {
  const lines = raw.replace(INVISIBLE_RE, "").replace(/\r\n/g, "\n").split("\n");
  const rawMessages: (RawLine & { extra: string[] })[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    const match = IOS_RE.exec(line) ?? ANDROID_RE.exec(line);
    if (match) {
      rawMessages.push({ dateText: match[1], timeText: match[2], rest: match[3], lineNo: index + 1, extra: [] });
    } else if (rawMessages.length > 0) {
      rawMessages[rawMessages.length - 1].extra.push(line);
    } else if (line.trim()) {
      warnings.push(`第 ${index + 1} 行：無法辨識的內容，已略過：${line.slice(0, 50)}`);
    }
  });

  const order = detectDateOrder(rawMessages.map((m) => splitDate(m.dateText)).filter((d): d is number[] => d !== null));
  const participants = new Map<string, true>();
  const messages: ParsedMessage[] = [];

  for (const m of rawMessages) {
    const parts = splitDate(m.dateText);
    const date = parts ? toIsoDate(parts, order) : null;
    if (!date) {
      warnings.push(`第 ${m.lineNo} 行：日期格式無法辨識，已略過`);
      continue;
    }
    // "Name: text" — names can contain spaces and colons are rare in them;
    // lines without ": " are system notices (encryption banner, joins…).
    const sep = m.rest.indexOf(": ");
    const sender = sep > 0 ? m.rest.slice(0, sep).trim() : null;
    const body = [sep > 0 ? m.rest.slice(sep + 2) : m.rest, ...m.extra].join("\n").replace(/\n+$/, "");
    const time = toTime(m.timeText);
    if (sender) participants.set(sender, true);
    messages.push({
      sequenceNo: messages.length + 1,
      date,
      time,
      sender,
      text: body,
      messageType: classify(sender, body),
      rawLineRef: m.lineNo,
      dedupeHash: fnv1a(`${date}|${time}|${sender ?? ""}|${body}`),
    });
  }

  return { chatName: chatNameHint, participants: [...participants.keys()], messages, warnings };
}

/** "WhatsApp Chat with Kenny.zip" / "WhatsApp Chat - Kenny.txt" / "與Kenny的WhatsApp對話" → "Kenny" */
export function chatNameFromWhatsAppFileName(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.(zip|txt)$/i, "");
  const match =
    base.match(/^WhatsApp Chat (?:with|-)\s*(.+)$/i) ??
    base.match(/^與\s*(.+?)\s*的\s*WhatsApp\s*(?:對話|聊天)/i) ??
    base.match(/^WhatsApp\s*(?:對話|聊天)\s*[-–]?\s*(.+)$/i);
  return match ? match[1].trim() : null;
}
