import type { ContactDraft } from "@/lib/bot/extract";
import { GREETING_LABELS, type GreetingKind } from "@/lib/bot/templates";
import { contactListUrl, sendMessageUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";
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

// ---------------------------------------------------------------------------
// Look & feel — every card shares one structure: a brand-colored header band
// with a bold title, a white body, and a light-grey footer of rounded "pill"
// buttons (primary filled, the rest outlined, two per row), optionally ending
// in a row of navigation pills (今日／人脈／提醒) so you never have to go
// back to the menu. Change the palette here and every card follows.
// ---------------------------------------------------------------------------

export const THEME = {
  brand: "#F7C948",
  brandInk: "#3B2F00",
  brandSub: "#6E5A12",
  ink: "#222222",
  muted: "#8C8C8C",
  footer: "#F2F2F2",
  outline: "#8B7B55",
  link: "#2F6F9F",
} as const;

type ButtonStyle = "primary" | "secondary" | "link";

/** A rounded pill (a tappable box, so it can be outlined — native buttons can't). */
export function pill(action: Action, style: ButtonStyle = "secondary", flex = 1): Record<string, unknown> {
  const primary = style === "primary";
  return {
    type: "box",
    layout: "vertical",
    flex,
    action,
    cornerRadius: "20px",
    paddingAll: "8px",
    justifyContent: "center",
    backgroundColor: primary ? THEME.brand : style === "secondary" ? "#FFFFFF" : THEME.footer,
    ...(style === "secondary" ? { borderWidth: "1px", borderColor: THEME.outline } : {}),
    contents: [
      t(action.label, {
        size: "sm",
        align: "center",
        weight: primary ? "bold" : "regular",
        color: style === "link" ? THEME.link : primary ? THEME.brandInk : THEME.ink,
      }),
    ],
  };
}

type Pill = { action: Action; style: ButtonStyle };

function button(action: Action | null, style: ButtonStyle = "secondary"): Pill | null {
  return action ? { action, style } : null;
}

/** Primary pills get a row to themselves; the others pair up two per row. */
function pillRows(pills: Pill[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let pending: Pill[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    rows.push({ type: "box", layout: "horizontal", spacing: "sm", contents: pending.map((p) => pill(p.action, p.style)) });
    pending = [];
  };
  for (const p of pills) {
    if (p.style === "primary") {
      flush();
      rows.push(pill(p.action, "primary"));
    } else {
      pending.push(p);
      if (pending.length === 2) flush();
    }
  }
  flush();
  return rows;
}

/** 今日／人脈／提醒 — the three places you go most, on hub cards. */
export function navActions(): Action[] {
  const list = contactListUrl();
  return [
    postback("今日", { a: "cmd", c: "today" }, "今日"),
    (list ? uri("人脈", list) : null) ?? postback("人脈", { a: "cmd", c: "search" }, "找人"),
    postback("提醒", { a: "cmd", c: "reminders" }, "提醒"),
  ];
}

function navRow(hint?: string): Record<string, unknown>[] {
  return [
    { type: "box", layout: "horizontal", spacing: "sm", margin: "md", contents: navActions().map((a) => pill(a, "secondary")) },
    ...(hint ? [t(hint, { size: "xxs", color: THEME.muted, align: "center", margin: "sm" })] : []),
  ];
}

export function cardBubble(opts: {
  title: string;
  subtitle?: string;
  body?: Record<string, unknown>[];
  buttons?: (Pill | null)[];
  /** Append the 今日／人脈／提醒 navigation row (with an optional grey hint under it). */
  nav?: boolean | string;
  size?: "kilo" | "mega";
}) {
  const buttons = (opts.buttons ?? []).filter((b): b is Pill => Boolean(b));
  const footer = [...pillRows(buttons), ...(opts.nav ? navRow(typeof opts.nav === "string" ? opts.nav : undefined) : [])];
  return {
    type: "bubble",
    size: opts.size ?? "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: THEME.brand,
      paddingAll: "14px",
      contents: [
        t(opts.title, { weight: "bold", size: "md", color: THEME.brandInk, align: "center" }),
        ...(opts.subtitle ? [t(opts.subtitle, { size: "xs", color: THEME.brandSub, align: "center" })] : []),
      ],
    },
    ...(opts.body && opts.body.length > 0
      ? { body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: opts.body } }
      : {}),
    ...(footer.length > 0
      ? { footer: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px", backgroundColor: THEME.footer, contents: footer } }
      : {}),
  };
}

const bubble = cardBubble;

/** A small card with a headline and a few action buttons. */
export function noticeCard(altText: string, title: string, subtitle: string | undefined, actions: Action[]): LineMessage {
  return flex(altText, bubble({ title, subtitle, buttons: actions.map((a, i) => button(a, i === 0 ? "primary" : "secondary")) }));
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
      body,
      buttons: actions.map((a, i) => button(a, i === 0 ? "primary" : "secondary")),
      nav: true,
    }),
  );
}

export function flexMessage(altText: string, contents: Record<string, unknown>, quick?: Action[]): LineMessage {
  return flex(altText, contents, quick);
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
  | "linkedin_url"
  | "facebook_url"
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

export function contactBubble(contact: ContactForCard, links?: ContactLinks, lastTouch?: LastTouch, latestPost?: LastTouch) {
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
  const body: Record<string, unknown>[] = [];
  // What to pick the conversation up from comes first — it's why you opened the card.
  if (lastTouch) body.push(highlight(`💬 上次聊到（${touchLine(lastTouch)}）`));
  if (latestPost) body.push(highlight(`📣 他的動態（${touchLine(latestPost)}）`));
  body.push(...lines.filter(([, v]) => v).map(([k, v]) => row(k, v!)));
  const missing = missingFields(contact);
  if (missing.length > 0) {
    body.push(t(`還缺：${missing.map((f) => FIELD_LABELS[f]).join("、")}`, { size: "xs", color: "#b26a00" }));
  }
  return bubble({
    title: `${contact.is_important ? "★ " : ""}${contact.name}`,
    subtitle: [contact.title, contact.company].filter(Boolean).join(" · ") || undefined,
    body: body.length > 0 ? body : [t("目前只有名字，按「📇 詳細／編輯」一次填完。", { size: "sm", color: THEME.muted })],
    buttons: [
      button(postback("💬 傳訊息", { a: "msg", id: contact.id, k: "hello" }), "primary"),
      button(
        (links ? uri(missing.length > 0 ? "📇 補資料" : "📇 詳細", links.edit) : null) ??
          postback("✏️ 編輯資料", { a: "fill", id: contact.id }),
      ),
      button((links ? uri("📝 加待辦", links.task) : null) ?? postback("📝 加待辦", { a: "task", id: contact.id })),
      button(contact.linkedin_url ? uri("🔗 LinkedIn", contact.linkedin_url) : null),
      button(contact.facebook_url ? uri("🔗 Facebook", contact.facebook_url) : null),
    ],
  });
}

function highlight(value: string) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#FFF6D6",
    cornerRadius: "8px",
    paddingAll: "8px",
    contents: [t(value, { size: "xs", color: THEME.brandInk })],
  };
}

export function contactCards(
  contacts: ContactForCard[],
  intro?: string,
  linksFor?: (contact: ContactForCard) => ContactLinks | undefined,
  lastTouches?: Map<string, LastTouch>,
  latestPosts?: Map<string, LastTouch>,
): LineMessage[] {
  const messages: LineMessage[] = [];
  if (intro) messages.push(text(intro));
  messages.push(
    carousel(
      contacts.map((c) => c.name).join("、"),
      contacts.slice(0, 10).map((c) => contactBubble(c, linksFor?.(c), lastTouches?.get(c.id), latestPosts?.get(c.id))),
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
  /** Which occasion, when kind === "festival" (e.g. "聖誕節") — carried through 換一句/AI/複製. */
  occasionName?: string;
  variant: number;
  reminderId?: string;
  /** Extra secondary actions appended at the end (e.g. the festival broadcast's "全部已傳"). */
  extraActions?: Action[];
  /** Shows "🤖 AI 客製化" (needs a contact to personalise against, and OPENROUTER_API_KEY set). */
  aiAvailable?: boolean;
}) {
  const { contact, messageText } = opts;
  const waPhone = contact?.whatsapp_phone ?? null;
  const occasionParam: Record<string, string> = opts.occasionName ? { o: opts.occasionName } : {};
  // Only a single, specific contact can have a send tracked (a broadcast has
  // no one contact to credit it to, and no way to know who actually got it).
  const trackSend = contact && isLinkSigningConfigured();
  const send = (channel: "line" | "whatsapp" | "wechat") =>
    trackSend
      ? sendMessageUrl({ contactId: contact.id, channel, kind: opts.kind, occasionName: opts.occasionName, variant: opts.variant, reminderId: opts.reminderId })
      : null;
  const wechatUrl = send("wechat");
  const whatsappHref = waPhone ? (send("whatsapp") ?? whatsappUrl(waPhone, messageText)) : null;
  const buttons = [
    button(uri(contact ? "LINE 傳送（選他）" : "LINE 群發（可多選）", send("line") ?? lineShareUrl(messageText)), "primary"),
    button(whatsappHref ? uri("WhatsApp", whatsappHref) : null),
    button(contact?.line_id ? uri("LINE 個人頁", lineProfileUrl(contact.line_id)) : null),
    button(
      contact?.wechat_id || !contact
        ? (wechatUrl ? uri("WeChat 複製文字", wechatUrl) : null) ??
            postback("WeChat 複製文字", { a: "copy", ...(contact ? { id: contact.id } : {}), k: opts.kind, ...occasionParam, v: opts.variant })
        : null,
    ),
    button(
      opts.aiAvailable && contact
        ? postback("🤖 AI 客製化", { a: "ai_msg", id: contact.id, k: opts.kind, ...occasionParam, ...(opts.reminderId ? { r: opts.reminderId } : {}) })
        : null,
    ),
    button(postback("🔄 換一句", { a: "msg", ...(contact ? { id: contact.id } : {}), k: opts.kind, ...occasionParam, v: opts.variant + 1, ...(opts.reminderId ? { r: opts.reminderId } : {}) })),
    // When sends are tracked, the send flow itself has its own "我傳了" / auto
    // confirm (and also logs the interaction) — this plain button would skip that.
    button(opts.reminderId && !trackSend ? postback("✅ 已傳，完成", { a: "rem_done", id: opts.reminderId }, "已傳") : null),
    ...(opts.extraActions ?? []).map((a) => button(a)),
  ];
  return bubble({
    title: opts.title,
    subtitle: opts.subtitle,
    body: [t(messageText, { size: "sm" })],
    buttons,
  });
}

/** `occasionNames` are the owner's currently enabled greeting occasions (festival-type). */
export function greetingKindPicker(contactId: string, occasionNames: string[]): LineMessage {
  const items = [
    postback(GREETING_LABELS.hello, { a: "msg", id: contactId, k: "hello" }),
    postback(GREETING_LABELS.birthday, { a: "msg", id: contactId, k: "birthday" }),
    ...occasionNames.map((name) => postback(`${name}祝福`, { a: "msg", id: contactId, k: "festival", o: name })),
  ];
  return text("要傳哪一種？", items);
}

// ---------------------------------------------------------------------------
// Tasks / help
// ---------------------------------------------------------------------------

export type TaskForList = Pick<TaskRow, "id" | "title" | "due_date"> & { contact: { name: string } | null };

export function taskListBubble(tasks: TaskForList[], title: string, today: string) {
  return bubble({
    title,
    nav: true,
    body: tasks.slice(0, 10).map((task) => ({
      type: "box",
      layout: "horizontal",
      spacing: "sm",
      alignItems: "center",
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
        pill(postback("完成", { a: "task_done", id: task.id }, `完成：${task.title.slice(0, 30)}`), "secondary", 2),
      ],
    })),
  });
}

export const MAIN_QUICK: Action[] = [
  postback("今日", { a: "cmd", c: "today" }, "今日"),
  postback("找人", { a: "cmd", c: "search" }, "找人"),
  postback("久沒聯絡", { a: "cmd", c: "keep" }, "久沒聯絡"),
  postback("轉傳紀錄", { a: "cmd", c: "collect" }, "轉傳紀錄"),
];

export function helpMessages(): LineMessage[] {
  return [
    text(
      [
        "我是你的人脈小幫手，直接打字就好：",
        "",
        "🔍 找 王小明（或直接打名字）",
        "💬 交流 王小明 聊到他兒子要考學測（卡片會提醒你上次聊到哪）",
        "📣 動態 王小明 升任副總（他在 LinkedIn／FB 發的近況）",
        "👋 久沒聯絡（★ 重要人脈太久沒聊的）",
        "📜 歷史 王小明（看完整溝通節點）",
        "🗒 備註 王小明 喜歡喝咖啡（長期不變的事）",
        "📝 待辦 寄報價給王小明 明天",
        "",
        "💬 到好友聊天室長按訊息 →「轉傳」給我 → 選是誰 → AI 整理成溝通節點",
        "📄 傳 LINE／WhatsApp 匯出的聊天 .txt 或 .zip → 一樣會整理溝通節點",
        "🔗 貼 LinkedIn／Facebook 個人頁連結 → 存到他的卡片",
        "📣 貼他的貼文連結（或打「動態」再傳截圖）→ 存成他的動態",
        "📷 傳名片、好友個人頁截圖 → 建檔；好友列表截圖 → 批量建檔",
      ].join("\n"),
      MAIN_QUICK,
    ),
  ];
}
