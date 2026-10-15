import type { ContactDraft } from "@/lib/bot/extract";
import { GREETING_LABELS, type GreetingKind } from "@/lib/bot/templates";
import type { ContactRow, TaskRow } from "@/types/database";

import type { LineMessage } from "./api";
import { lineProfileUrl, lineShareUrl, whatsappUrl } from "./links";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

type Action =
  | { type: "postback"; label: string; data: string; displayText?: string }
  | { type: "uri"; label: string; uri: string }
  | { type: "message"; label: string; text: string };

const MAX_URI = 1000;

export function postback(label: string, params: Record<string, string | number>, displayText?: string): Action {
  const data = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  return { type: "postback", label: label.slice(0, 40), data, ...(displayText ? { displayText } : {}) };
}

export function uri(label: string, href: string): Action | null {
  return href.length <= MAX_URI ? { type: "uri", label: label.slice(0, 40), uri: href } : null;
}

export function messageAction(label: string, text: string): Action {
  return { type: "message", label: label.slice(0, 20), text };
}

export interface QuickItem {
  label: string;
  action: Action;
}

export function text(body: string, quick?: Action[]): LineMessage {
  return {
    type: "text",
    text: body.slice(0, 5000),
    ...(quick && quick.length > 0
      ? {
          quickReply: {
            items: quick.slice(0, 13).map((action) => ({ type: "action", action: { ...action, label: action.label.slice(0, 20) } })),
          },
        }
      : {}),
  };
}

function flex(altText: string, contents: Record<string, unknown>, quick?: Action[]): LineMessage {
  return {
    type: "flex",
    altText: altText.slice(0, 400),
    contents,
    ...(quick && quick.length > 0
      ? {
          quickReply: {
            items: quick.slice(0, 13).map((action) => ({ type: "action", action: { ...action, label: action.label.slice(0, 20) } })),
          },
        }
      : {}),
  };
}

const t = (value: string, extra: Record<string, unknown> = {}) => ({ type: "text", text: value || " ", wrap: true, ...extra });

function row(label: string, value: string) {
  return {
    type: "box",
    layout: "baseline",
    spacing: "sm",
    contents: [
      t(label, { size: "sm", color: "#8c8c8c", flex: 2 }),
      t(value, { size: "sm", color: "#222222", flex: 5 }),
    ],
  };
}

function button(action: Action | null, style: "primary" | "secondary" | "link" = "secondary") {
  if (!action) return null;
  return { type: "button", style, height: "sm", action };
}

function bubble(opts: {
  title: string;
  subtitle?: string;
  body?: Record<string, unknown>[];
  buttons?: (Record<string, unknown> | null)[];
  accent?: string;
}) {
  const buttons = (opts.buttons ?? []).filter(Boolean);
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: opts.accent ?? "#111111",
      paddingAll: "14px",
      contents: [
        t(opts.title, { weight: "bold", size: "md", color: "#ffffff" }),
        ...(opts.subtitle ? [t(opts.subtitle, { size: "xs", color: "#dddddd" })] : []),
      ],
    },
    ...(opts.body && opts.body.length > 0
      ? { body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: opts.body } }
      : {}),
    ...(buttons.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } }
      : {}),
  };
}

/** A small card with a headline and a few action buttons. */
export function noticeCard(altText: string, title: string, subtitle: string | undefined, actions: Action[]): LineMessage {
  return flex(altText, bubble({ title, subtitle, accent: "#2f5d50", buttons: actions.map((a, i) => button(a, i === 0 ? "secondary" : "link")) }));
}

/** A headline, a list of short lines (muted ones greyed out) and buttons. */
export function listCard(opts: {
  altText: string;
  title: string;
  subtitle?: string;
  items: { text: string; muted?: boolean }[];
  note?: string;
  actions: (Action | null)[];
}): LineMessage {
  const shown = opts.items.slice(0, 40);
  const body = [
    ...shown.map((item) => t(item.text, { size: "sm", color: item.muted ? "#a0a0a0" : "#222222" })),
    ...(opts.items.length > shown.length ? [t(`…還有 ${opts.items.length - shown.length} 位`, { size: "xs", color: "#8c8c8c" })] : []),
    ...(opts.note ? [t(opts.note, { size: "xs", color: "#8c8c8c", margin: "md" })] : []),
  ];
  const actions = opts.actions.filter((a): a is Action => Boolean(a));
  return flex(
    opts.altText,
    bubble({
      title: opts.title,
      subtitle: opts.subtitle,
      accent: "#2f5d50",
      body,
      buttons: actions.map((a, i) => button(a, i === 0 ? "primary" : i === 1 ? "secondary" : "link")),
    }),
  );
}

export function carousel(altText: string, bubbles: Record<string, unknown>[], quick?: Action[]): LineMessage {
  if (bubbles.length === 1) return flex(altText, bubbles[0], quick);
  return flex(altText, { type: "carousel", contents: bubbles.slice(0, 12) }, quick);
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const ROLE_LABEL: Record<string, string> = { boss: "老闆", non_boss: "非老闆", unclassified: "未分類" };

export type ContactForCard = Pick<
  ContactRow,
  | "id"
  | "name"
  | "company"
  | "title"
  | "role_type"
  | "phone"
  | "email"
  | "line_display_name"
  | "line_id"
  | "whatsapp_phone"
  | "wechat_id"
  | "birthday_month"
  | "birthday_day"
  | "notes"
  | "is_important"
>;

export const FILLABLE_FIELDS = [
  "company",
  "title",
  "role_type",
  "birthday",
  "phone",
  "line_id",
  "whatsapp_phone",
  "wechat_id",
  "email",
] as const;
export type FillableField = (typeof FILLABLE_FIELDS)[number];

export const FIELD_LABELS: Record<FillableField | "name" | "notes", string> = {
  name: "姓名",
  company: "公司",
  title: "職稱",
  role_type: "身分",
  birthday: "生日",
  phone: "電話",
  line_id: "LINE ID",
  whatsapp_phone: "WhatsApp",
  wechat_id: "WeChat",
  email: "Email",
  notes: "備註",
};

export function missingFields(contact: ContactForCard): FillableField[] {
  return FILLABLE_FIELDS.filter((field) => {
    if (field === "role_type") return contact.role_type === "unclassified";
    if (field === "birthday") return !contact.birthday_month || !contact.birthday_day;
    return !contact[field];
  });
}

/** Links into the mini-forms (signed URLs, built by the bot on the server). */
export interface ContactLinks {
  edit: string;
  task: string;
}

export interface LastTouch {
  occurred_on: string;
  content: string;
}

/** "10/15：他兒子下個月要考學測" — short-dated so it reads at a glance on a card. */
function touchLine(touch: LastTouch): string {
  const [, month, day] = touch.occurred_on.split("-");
  return `${Number(month)}/${Number(day)}：${touch.content.replace(/[\r\n]+/g, " ").slice(0, 60)}`;
}

export function contactBubble(contact: ContactForCard, links?: ContactLinks, lastTouch?: LastTouch) {
  const lines: [string, string | null][] = [
    ["公司", contact.company],
    ["職稱", contact.title],
    ["身分", ROLE_LABEL[contact.role_type] ?? null],
    ["電話", contact.phone],
    ["Email", contact.email],
    ["LINE", contact.line_id ?? contact.line_display_name],
    ["WhatsApp", contact.whatsapp_phone],
    ["WeChat", contact.wechat_id],
    ["生日", contact.birthday_month && contact.birthday_day ? `${contact.birthday_month}/${contact.birthday_day}` : null],
    ["備註", contact.notes ? contact.notes.slice(0, 80) : null],
  ];
  const body = lines.filter(([, v]) => v).map(([k, v]) => row(k, v!));
  if (lastTouch) body.unshift(t(`💬 上次聊到（${touchLine(lastTouch)}）`, { size: "xs", color: "#2f5d50", wrap: true }) as never);
  const missing = missingFields(contact);
  if (missing.length > 0) {
    body.push(t(`還缺：${missing.map((f) => FIELD_LABELS[f]).join("、")}`, { size: "xs", color: "#b26a00" }) as never);
  }
  return bubble({
    title: `${contact.is_important ? "★ " : ""}${contact.name}`,
    subtitle: [contact.title, contact.company].filter(Boolean).join(" · ") || undefined,
    body: body.length > 0 ? body : [t("目前只有名字，按「✏️ 編輯資料」一次填完。", { size: "sm", color: "#8c8c8c" })],
    buttons: [
      button(postback("💬 傳訊息", { a: "msg", id: contact.id, k: "hello" }), "primary"),
      button(
        (links ? uri(missing.length > 0 ? "✏️ 補齊資料" : "✏️ 編輯資料", links.edit) : null) ??
          postback("✏️ 編輯資料", { a: "fill", id: contact.id }),
      ),
      button((links ? uri("📝 加待辦", links.task) : null) ?? postback("📝 加待辦", { a: "task", id: contact.id })),
    ],
  });
}

export function contactCards(
  contacts: ContactForCard[],
  intro?: string,
  linksFor?: (contact: ContactForCard) => ContactLinks | undefined,
  lastTouches?: Map<string, LastTouch>,
): LineMessage[] {
  const messages: LineMessage[] = [];
  if (intro) messages.push(text(intro));
  messages.push(
    carousel(
      contacts.map((c) => c.name).join("、"),
      contacts.slice(0, 10).map((c) => contactBubble(c, linksFor?.(c), lastTouches?.get(c.id))),
    ),
  );
  return messages;
}

export function draftBubble(draft: ContactDraft, source: string) {
  const entries: [string, string | undefined][] = [
    ["姓名", draft.name],
    ["LINE 名稱", draft.line_display_name],
    ["公司", draft.company],
    ["職稱", draft.title],
    ["身分", draft.role_type ? ROLE_LABEL[draft.role_type] : undefined],
    ["電話", draft.phone],
    ["Email", draft.email],
    ["LINE", draft.line_id],
    ["WhatsApp", draft.whatsapp_phone],
    ["WeChat", draft.wechat_id],
    ["生日", draft.birthday_month ? `${draft.birthday_month}/${draft.birthday_day}` : undefined],
    ["備註", draft.notes?.slice(0, 80)],
  ];
  return flex(
    "確認要建立的人脈",
    bubble({
      title: draft.name ? `建立「${draft.name}」？` : "我抓到的資料",
      subtitle: source,
      body: entries.filter(([, v]) => v).map(([k, v]) => row(k, v!)),
      buttons: [
        button(postback(draft.name ? "✅ 正確，建立" : "先告訴我名字", { a: "draft_ok" }, "建立"), "primary"),
        button(postback("✏️ 改姓名", { a: "draft_edit", f: "name" })),
        button(postback("✏️ 改公司／職稱", { a: "draft_edit", f: "company" })),
        button(postback("✖ 不要建立", { a: "draft_cancel" }, "不要建立")),
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Messages to send (LINE share picker / WhatsApp / WeChat copy)
// ---------------------------------------------------------------------------

export function sendMessageBubble(opts: {
  title: string;
  subtitle?: string;
  messageText: string;
  contact: Pick<ContactForCard, "id" | "phone" | "whatsapp_phone" | "wechat_id" | "line_id"> | null;
  kind: GreetingKind;
  variant: number;
  reminderId?: string;
  accent?: string;
}) {
  const { contact, messageText } = opts;
  const waPhone = contact?.whatsapp_phone ?? null;
  const buttons = [
    button(uri(contact ? "LINE 傳送（選他）" : "LINE 群發（可多選）", lineShareUrl(messageText)), "primary"),
    button(waPhone ? uri("WhatsApp 直接開聊天", whatsappUrl(waPhone, messageText) ?? "") : null),
    button(contact?.line_id ? uri("開他的 LINE 個人頁", lineProfileUrl(contact.line_id)) : null),
    button(
      contact?.wechat_id || !contact
        ? postback("WeChat：給我純文字複製", { a: "copy", ...(contact ? { id: contact.id } : {}), k: opts.kind, v: opts.variant })
        : null,
    ),
    button(postback("🔄 換一句", { a: "msg", ...(contact ? { id: contact.id } : {}), k: opts.kind, v: opts.variant + 1, ...(opts.reminderId ? { r: opts.reminderId } : {}) })),
    button(opts.reminderId ? postback("✅ 已傳，完成", { a: "rem_done", id: opts.reminderId }, "已傳") : null),
  ];
  return bubble({
    title: opts.title,
    subtitle: opts.subtitle,
    accent: opts.accent,
    body: [t(messageText, { size: "sm" })],
    buttons,
  });
}

export function greetingKindPicker(contactId: string): LineMessage {
  return text(
    "要傳哪一種？",
    (Object.keys(GREETING_LABELS) as GreetingKind[]).map((k) => postback(GREETING_LABELS[k], { a: "msg", id: contactId, k })),
  );
}

// ---------------------------------------------------------------------------
// Tasks / help
// ---------------------------------------------------------------------------

export type TaskForList = Pick<TaskRow, "id" | "title" | "due_date"> & { contact: { name: string } | null };

export function taskListBubble(tasks: TaskForList[], title: string, today: string) {
  return bubble({
    title,
    accent: "#2f5d50",
    body: tasks.slice(0, 10).map((task) => ({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            t(task.title, { size: "sm" }),
            t(
              [task.due_date ? (task.due_date < today ? `⚠ 逾期 ${task.due_date}` : `📅 ${task.due_date}`) : null, task.contact?.name]
                .filter(Boolean)
                .join(" · ") || "無期限",
              { size: "xxs", color: "#8c8c8c" },
            ),
          ],
        },
        {
          type: "button",
          flex: 2,
          height: "sm",
          style: "link",
          action: postback("完成", { a: "task_done", id: task.id }, `完成：${task.title.slice(0, 30)}`),
        },
      ],
    })),
  });
}

export const MAIN_QUICK: Action[] = [
  postback("今日", { a: "cmd", c: "today" }, "今日"),
  postback("新增人脈", { a: "cmd", c: "add" }, "新增人脈"),
  postback("找人", { a: "cmd", c: "search" }, "找人"),
  postback("待辦", { a: "cmd", c: "tasks" }, "待辦"),
  postback("生日", { a: "cmd", c: "birthdays" }, "生日"),
  postback("提醒", { a: "cmd", c: "reminders" }, "提醒"),
  postback("轉傳紀錄", { a: "cmd", c: "collect" }, "轉傳紀錄"),
];

export function helpMessages(): LineMessage[] {
  return [
    text(
      [
        "我是你的人脈小幫手，直接打字就好：",
        "",
        "👤 新增 王小明 台積電 經理 0912345678 生日3/4",
        "🔍 找 王小明（或直接打名字）",
        "📝 待辦 寄報價給王小明 明天",
        "🤝 會議 王小明 今天談合作，下週回覆報價",
        "🗒 備註 王小明 喜歡喝咖啡（長期不變的事）",
        "💬 交流 王小明 聊到他兒子要考學測（每次聊了什麼，卡片會提醒你上次聊到哪）",
        "📜 歷史 王小明（看完整交流紀錄）",
        "🎂 生日／提醒／待辦／今日",
        "",
        "💬 到好友聊天室長按訊息 →「轉傳」給我（可多選）→ 選是誰 → 存成他的聊天紀錄並補上電話、Email",
        "📷 傳名片、好友個人頁或好友名片的截圖 → 直接建檔",
        "📷 傳「聊天」或「好友」列表截圖（可一次多張）→ 批量建檔",
        "（LINE 的「分享好友」機器人收不到，請改用轉傳或截圖）",
        "📄 傳 LINE／WhatsApp 匯出的聊天 .txt 或 .zip → 匯入聊天紀錄",
        "",
        "人脈卡上的「✏️ 編輯資料」會開一頁式表單，所有欄位一次填完。",
      ].join("\n"),
      MAIN_QUICK,
    ),
  ];
}
