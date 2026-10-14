import { normalizeText } from "./extract";

export type Intent =
  | { kind: "help" }
  | { kind: "today" }
  | { kind: "cancel" }
  | { kind: "add_contact"; args: string }
  | { kind: "search"; query: string }
  | { kind: "list_contacts" }
  | { kind: "list_tasks" }
  | { kind: "add_task"; text: string }
  | { kind: "list_reminders" }
  | { kind: "birthdays" }
  | { kind: "meeting"; text: string }
  | { kind: "note"; name: string; text: string }
  | { kind: "generate_reminders" }
  | { kind: "web" }
  | { kind: "unknown"; text: string };

const RULES: [RegExp, (m: RegExpMatchArray) => Intent][] = [
  [/^(?:說明|幫助|help|指令|選單|menu|更多|\?|？)$/i, () => ({ kind: "help" })],
  [/^(?:今日|今天|首頁|摘要|today)$/i, () => ({ kind: "today" })],
  [/^(?:取消|算了|結束|不用了|cancel)$/i, () => ({ kind: "cancel" })],
  [/^(?:新增|加入|建立|新建|加)(?:人脈|聯絡人|好友|朋友)?\s*([\s\S]*)$/, (m) => ({ kind: "add_contact", args: m[1].trim() })],
  [/^(?:找|查|搜尋|搜|查詢|search)\s*(.+)$/i, (m) => ({ kind: "search", query: m[1].trim() })],
  [/^(?:人脈|聯絡人|所有人脈|全部人脈|人脈清單)$/, () => ({ kind: "list_contacts" })],
  [/^(?:待辦|待辦事項|待辦清單|todo|任務)$/i, () => ({ kind: "list_tasks" })],
  [/^(?:待辦|todo|提醒我|記得|要做)\s+([\s\S]+)$/i, (m) => ({ kind: "add_task", text: m[1].trim() })],
  [/^(?:提醒|提醒清單|節日|節日提醒|所有提醒)$/, () => ({ kind: "list_reminders" })],
  [/^(?:生日|誰生日|近期生日|生日清單|壽星)$/, () => ({ kind: "birthdays" })],
  [/^(?:會議|開會|紀錄|記錄|見面|拜訪)\s+([\s\S]+)$/, (m) => ({ kind: "meeting", text: m[1].trim() })],
  [/^(?:備註|筆記|記下)\s+(\S+)\s+([\s\S]+)$/, (m) => ({ kind: "note", name: m[1], text: m[2].trim() })],
  [/^(?:產生提醒|生成提醒|更新提醒)$/, () => ({ kind: "generate_reminders" })],
  [/^(?:網頁|後台|網頁版|匯出|匯入|設定|web)$/i, () => ({ kind: "web" })],
];

export function parseIntent(input: string): Intent {
  const text = normalizeText(input).trim();
  for (const [re, build] of RULES) {
    const match = text.match(re);
    if (match) return build(match);
  }
  return { kind: "unknown", text };
}
