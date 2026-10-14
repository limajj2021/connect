import "server-only";

import type { LineMessage } from "@/lib/line/api";
import {
  FIELD_LABELS,
  MAIN_QUICK,
  type ContactForCard,
  type FillableField,
  carousel,
  contactBubble,
  contactCards,
  contactMoreMenu,
  draftBubble,
  greetingKindPicker,
  helpMessages,
  messageAction,
  missingFields,
  noticeCard,
  postback,
  sendMessageBubble,
  taskListBubble,
  text,
  uri,
} from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";
import { generateReminders } from "@/lib/reminders/generate";
import { FESTIVAL_LABELS } from "@/lib/reminders/taiwan-holidays";
import type { FestivalKey } from "@/types/database";

import {
  type BotCtx,
  appendNote,
  contactsMentionedIn,
  createContact,
  createMeeting,
  createTask,
  deleteContact,
  findContactByExactName,
  getContact,
  listPendingReminders,
  listPendingTasks,
  loadSession,
  recentContacts,
  saveSession,
  searchContacts,
  setReminderStatus,
  setTaskStatus,
  upcomingBirthdays,
  updateContact,
} from "./data";
import { extractDueDate, formatShortDate } from "./dates";
import { birthdayBubble, buildDigest, festivalGroupBubble, otherReminderBubble } from "./digest";
import { type ContactDraft, extractContactFields, extractFromCommand, normalizePhone, normalizeText, parseBirthday } from "./extract";
import { type Intent, parseIntent } from "./intent";
import { GREETING_LABELS, type GreetingKind, greetingText } from "./templates";

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

type EditableField = FillableField | "notes" | "name";

export type FlowState =
  | { flow: "fill"; contactId: string; queue: FillableField[] }
  | { flow: "edit"; contactId: string; field: EditableField }
  | { flow: "draft"; draft: ContactDraft; source: string; editing?: "name" | "company" }
  | { flow: "await_add" }
  | { flow: "await_search" }
  | { flow: "await_task"; contactId?: string }
  | { flow: "confirm_delete"; contactId: string };

const STOP_QUICK = [messageAction("略過", "略過"), postback("結束", { a: "stop" }, "結束")];

function questionFor(field: EditableField, contact: Pick<ContactForCard, "name" | "phone">): LineMessage {
  const contactName = contact.name;
  const label = FIELD_LABELS[field];
  if (field === "role_type") {
    return text(`${contactName} 是老闆嗎？`, [messageAction("老闆", "老闆"), messageAction("非老闆", "非老闆"), ...STOP_QUICK]);
  }
  const hints: Partial<Record<EditableField, string>> = {
    birthday: "（例如 3/4 或 1990/3/4）",
    phone: "（手機或市話）",
    whatsapp_phone: "（含國碼更好，例如 +886912345678）",
    line_id: "（對方可被搜尋的 LINE ID）",
    notes: "（喜好、家人、認識經過…都可以）",
  };
  // Most Taiwanese WhatsApp numbers are just the mobile number — offer it.
  const sameAsPhone =
    field === "whatsapp_phone" && contact.phone && /^(09|\+?8869)/.test(contact.phone)
      ? [messageAction(`同電話 ${contact.phone}`.slice(0, 20), contact.phone)]
      : [];
  return text(`${contactName} 的${label}是？${hints[field] ?? ""}`, [...sameAsPhone, ...STOP_QUICK]);
}

/** Parses one answer for a field; returns the DB patch, or an error message to re-ask. */
function parseAnswer(field: EditableField, answer: string, existing: ContactForCard | null): { patch?: Record<string, unknown>; error?: string } {
  const value = normalizeText(answer).trim();
  switch (field) {
    case "role_type":
      if (/非老闆|不是|員工|non/i.test(value)) return { patch: { role_type: "non_boss" } };
      if (/老闆|是|boss/i.test(value)) return { patch: { role_type: "boss" } };
      return { error: "請選「老闆」或「非老闆」" };
    case "birthday": {
      const parsed = parseBirthday(value);
      if (!parsed) return { error: "看不懂這個日期，請用 3/4 或 1990/3/4 的格式" };
      return { patch: { birthday_month: parsed.month, birthday_day: parsed.day, ...(parsed.year ? { birthday_year: parsed.year } : {}) } };
    }
    case "phone":
    case "whatsapp_phone": {
      const phone = normalizePhone(value);
      if (phone.replace(/\D/g, "").length < 8) return { error: "電話號碼好像不完整，再輸入一次？" };
      return { patch: { [field]: phone } };
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "Email 格式不對，再輸入一次？" };
      return { patch: { email: value.toLowerCase() } };
    case "notes": {
      const stamped = value;
      return { patch: { notes: existing?.notes ? `${existing.notes}\n${stamped}` : stamped } };
    }
    default:
      if (!value) return { error: "請輸入內容，或按「略過」" };
      return { patch: { [field]: value.slice(0, 200) } };
  }
}

async function askNextFill(ctx: BotCtx, contact: ContactForCard, queue: FillableField[], prefix: LineMessage[] = []) {
  if (queue.length === 0) {
    await saveSession(ctx, null);
    return [...prefix, text("👌 資料補好了："), carousel(contact.name, [contactBubble(contact)], MAIN_QUICK)];
  }
  await saveSession(ctx, { flow: "fill", contactId: contact.id, queue } satisfies FlowState);
  return [...prefix, questionFor(queue[0], contact)];
}

// ---------------------------------------------------------------------------
// Contact creation
// ---------------------------------------------------------------------------

async function createFromDraft(ctx: BotCtx, draft: ContactDraft): Promise<LineMessage[]> {
  const contact = await createContact(ctx, draft);
  const missing = missingFields(contact);
  const created = text(`✅ 已建立「${contact.name}」`);
  if (missing.length === 0) {
    await saveSession(ctx, null);
    return [created, carousel(contact.name, [contactBubble(contact)], MAIN_QUICK)];
  }
  return askNextFill(ctx, contact, missing, [
    created,
    text(`還缺 ${missing.map((f) => FIELD_LABELS[f]).join("、")}，我一項項問你，不知道就按「略過」。`),
  ]);
}

async function startAddContact(ctx: BotCtx, args: string): Promise<LineMessage[]> {
  if (!args.trim()) {
    await saveSession(ctx, { flow: "await_add" } satisfies FlowState);
    return [text("請輸入名字，可以一起打公司、職稱、電話、生日，例如：\n王小明 台積電 經理 0912345678 生日3/4\n\n📷 也可以傳名片、好友個人頁或好友名片的截圖，我會直接建檔。\n（LINE 的「分享好友」機器人收不到，請改用截圖）", [postback("取消", { a: "stop" }, "取消")])];
  }
  const draft = extractFromCommand(args);
  if (!draft.name) {
    await saveSession(ctx, { flow: "draft", draft, source: "文字輸入", editing: "name" } satisfies FlowState);
    return [text("這位的名字是？", STOP_QUICK)];
  }
  const duplicates = await findContactByExactName(ctx, draft.name);
  if (duplicates.length > 0) {
    await saveSession(ctx, { flow: "draft", draft, source: "文字輸入" } satisfies FlowState);
    return [
      text(`已經有 ${duplicates.length} 位叫「${draft.name}」的人脈：`),
      carousel(draft.name, duplicates.map(contactBubble)),
      draftBubble(draft, "要另外再建一位嗎？"),
    ];
  }
  return createFromDraft(ctx, draft);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function showSearch(ctx: BotCtx, query: string): Promise<LineMessage[]> {
  const contacts = await searchContacts(ctx, query);
  if (contacts.length === 0) {
    return [text(`找不到「${query}」。`, [postback(`新增「${query.slice(0, 10)}」`, { a: "cmd", c: "add_named", n: query.slice(0, 50) }, `新增 ${query}`), ...MAIN_QUICK])];
  }
  return contactCards(contacts, contacts.length > 1 ? `找到 ${contacts.length} 位：` : undefined);
}

async function showTasks(ctx: BotCtx): Promise<LineMessage[]> {
  const { tasks, total } = await listPendingTasks(ctx, { limit: 10 });
  if (total === 0) return [text("目前沒有待辦 🎉\n新增請打：待辦 內容 日期，例如「待辦 寄報價給王小明 明天」", MAIN_QUICK)];
  return [
    carousel("待辦清單", [taskListBubble(tasks, `📝 待辦（${total}）`, ctx.today)], [
      postback("新增待辦", { a: "task" }, "新增待辦"),
      ...MAIN_QUICK,
    ]),
  ];
}

async function addTask(ctx: BotCtx, input: string, contactId?: string): Promise<LineMessage[]> {
  const { date, rest } = extractDueDate(input, ctx.today);
  const title = rest || input;
  let contact: { id: string; name: string } | null = null;
  if (contactId) {
    contact = await getContact(ctx, contactId);
  } else {
    contact = (await contactsMentionedIn(ctx, title))[0] ?? null;
  }
  await createTask(ctx, { title, due_date: date, contact_id: contact?.id });
  await saveSession(ctx, null);
  return [
    text(
      [`✅ 已加待辦：${title}`, date ? `📅 ${formatShortDate(date)}` : "📅 無期限", contact ? `👤 ${contact.name}` : null].filter(Boolean).join("\n"),
      [postback("看待辦", { a: "cmd", c: "tasks" }, "待辦"), ...MAIN_QUICK.slice(0, 3)],
    ),
  ];
}

async function showReminders(ctx: BotCtx): Promise<LineMessage[]> {
  const horizon = `${Number(ctx.today.slice(0, 4)) + 1}${ctx.today.slice(4)}`;
  const reminders = await listPendingReminders(ctx, { dueOnOrBefore: horizon, limit: 200 });
  if (reminders.length === 0) {
    return [text("目前沒有待處理的提醒。打「產生提醒」可依人脈的生日與三節建立今年和明年的提醒。", MAIN_QUICK)];
  }
  const festivals = new Map<string, typeof reminders>();
  const dated: { due: string; bubble: Record<string, unknown> }[] = [];
  for (const r of reminders) {
    if (r.reminder_type === "festival" && r.festival_key && r.occurrence_year) {
      const key = `${r.festival_key}|${r.occurrence_year}`;
      festivals.set(key, [...(festivals.get(key) ?? []), r]);
    } else if (r.reminder_type === "birthday" && r.contact) {
      dated.push({ due: r.due_date, bubble: birthdayBubble(r, ctx.today) });
    } else {
      dated.push({ due: r.due_date, bubble: otherReminderBubble(r, ctx.today) });
    }
  }
  for (const [key, list] of festivals) {
    const [festival, year] = key.split("|");
    dated.push({ due: list[0].due_date, bubble: festivalGroupBubble(festival as FestivalKey, Number(year), list) });
  }
  const all = dated.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10).map((d) => d.bubble);
  return [text(`未完成的提醒共 ${reminders.length} 則（一年內），先列最近的：`), carousel("提醒", all, MAIN_QUICK)];
}

async function showBirthdays(ctx: BotCtx): Promise<LineMessage[]> {
  const list = await upcomingBirthdays(ctx, 30);
  if (list.length === 0) return [text("未來 30 天沒有人生日。人脈補上生日後我會提前 3 天通知你 🎂", MAIN_QUICK)];
  const lines = list.map(({ contact, date, inDays }) => `${inDays === 0 ? "🎉 今天" : `${formatShortDate(date)}（${inDays} 天後）`} ${contact.name}`);
  return [
    text(
      `未來 30 天生日：\n${lines.join("\n")}`,
      list.slice(0, 10).map(({ contact }) => postback(`祝 ${contact.name}`, { a: "msg", id: contact.id, k: "birthday" })),
    ),
  ];
}

async function logMeeting(ctx: BotCtx, input: string): Promise<LineMessage[]> {
  const mentioned = await contactsMentionedIn(ctx, input);
  const { date, rest } = extractDueDate(input, ctx.today);
  const meetingDate = date && date <= ctx.today ? date : ctx.today;
  const firstLine = rest.split("\n")[0].trim();
  const title = firstLine.slice(0, 40) || "會議紀錄";
  await createMeeting(ctx, { title, meeting_date: meetingDate, content: input, contactIds: mentioned.map((c) => c.id) });
  return [
    text(
      [`✅ 已記錄會議（${formatShortDate(meetingDate)}）`, mentioned.length > 0 ? `👥 ${mentioned.map((c) => c.name).join("、")}` : "👥 沒認出人脈（記得在內容寫上名字）", `📝 ${title}`].join("\n"),
      mentioned.length > 0
        ? [postback("加後續待辦", { a: "task", id: mentioned[0].id }, `幫 ${mentioned[0].name} 加待辦`), ...MAIN_QUICK.slice(0, 3)]
        : MAIN_QUICK,
    ),
  ];
}

async function addNote(ctx: BotCtx, name: string, note: string): Promise<LineMessage[]> {
  const matches = await findContactByExactName(ctx, name);
  const contact = matches[0] ?? (await searchContacts(ctx, name, 1))[0];
  if (!contact) {
    return [text(`找不到「${name}」，要先新增嗎？`, [postback(`新增「${name.slice(0, 10)}」`, { a: "cmd", c: "add_named", n: name.slice(0, 50) }, `新增 ${name}`)])];
  }
  const updated = await appendNote(ctx, contact, note);
  return [text(`🗒 已記在 ${updated.name} 的備註。`, MAIN_QUICK)];
}

async function handleUnknown(ctx: BotCtx, input: string): Promise<LineMessage[]> {
  const exact = await findContactByExactName(ctx, input);
  if (exact.length > 0) return contactCards(exact);

  const { draft } = extractContactFields(input);
  if (draft.phone || draft.email || draft.line_id || draft.wechat_id) {
    await saveSession(ctx, { flow: "draft", draft, source: "從你傳的文字辨識" } satisfies FlowState);
    return [draftBubble(draft, "從你傳的文字辨識")];
  }

  if (input.length <= 20) {
    const partial = await searchContacts(ctx, input);
    if (partial.length > 0) return contactCards(partial, "你是要找這些人嗎？");
  }
  return [text(`我看不懂「${input.slice(0, 30)}」🙏\n打「說明」看我會做什麼，或用下面的按鈕：`, MAIN_QUICK)];
}

async function runIntent(ctx: BotCtx, intent: Intent): Promise<LineMessage[]> {
  await saveSession(ctx, null);
  switch (intent.kind) {
    case "help":
      return helpMessages();
    case "today": {
      const digest = await buildDigest(ctx);
      return digest.hasContent ? digest.messages : [text(`${formatShortDate(ctx.today)} 今天沒有要處理的事 🎉`, MAIN_QUICK)];
    }
    case "cancel":
      return [text("好，已取消。", MAIN_QUICK)];
    case "add_contact":
      return startAddContact(ctx, intent.args);
    case "search":
      return showSearch(ctx, intent.query);
    case "list_contacts": {
      const { contacts, total } = await recentContacts(ctx, 10);
      if (total === 0) return [text("還沒有任何人脈，打「新增 名字」或傳名片截圖開始吧！", MAIN_QUICK)];
      return contactCards(contacts, `共 ${total} 位人脈，最近新增的 ${contacts.length} 位：`);
    }
    case "list_tasks":
      return showTasks(ctx);
    case "add_task":
      return addTask(ctx, intent.text);
    case "list_reminders":
      return showReminders(ctx);
    case "birthdays":
      return showBirthdays(ctx);
    case "meeting":
      return logMeeting(ctx, intent.text);
    case "note":
      return addNote(ctx, intent.name, intent.text);
    case "generate_reminders": {
      const year = Number(ctx.today.slice(0, 4));
      const summary = await generateReminders([year, year + 1], { supabase: ctx.supabase, ownerId: ctx.ownerId });
      return [text(`✅ 已建立 ${summary.festivalsCreated} 筆節日提醒、${summary.birthdaysCreated} 筆生日提醒（${year}–${year + 1}）。`, MAIN_QUICK)];
    }
    case "web":
      return [
        text("這些比較適合在網頁做：", [
          uri("網頁首頁", webUrl("/"))!,
          uri("CSV 匯入/匯出", webUrl("/settings"))!,
          uri("聊天紀錄", webUrl("/records"))!,
        ]),
      ];
    case "unknown":
      return handleUnknown(ctx, intent.text);
  }
}

// ---------------------------------------------------------------------------
// Answers to an in-progress flow
// ---------------------------------------------------------------------------

async function handleFlowAnswer(ctx: BotCtx, state: FlowState, input: string): Promise<LineMessage[]> {
  const skip = /^(略過|跳過|不知道|skip|pass)$/i.test(input.trim());
  switch (state.flow) {
    case "await_add":
      return startAddContact(ctx, input);
    case "await_search":
      await saveSession(ctx, null);
      return showSearch(ctx, input);
    case "await_task":
      return addTask(ctx, input, state.contactId);
    case "confirm_delete":
      await saveSession(ctx, null);
      return [text("已取消刪除。", MAIN_QUICK)];
    case "draft": {
      const draft = { ...state.draft };
      if (state.editing === "name") {
        if (skip || !input.trim()) return [text("建立人脈至少要有名字喔，這位的名字是？", STOP_QUICK)];
        draft.name = normalizeText(input).trim().slice(0, 100);
      } else if (state.editing === "company") {
        const parts = normalizeText(input).trim().split(/\s+/);
        const fromText = extractContactFields(input).draft;
        draft.company = fromText.company ?? parts[0];
        draft.title = fromText.title ?? parts[1] ?? draft.title;
      } else {
        // Free text while a draft is pending: treat as additional info.
        const extra = extractContactFields(input).draft;
        Object.assign(draft, Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)));
      }
      await saveSession(ctx, { flow: "draft", draft, source: state.source } satisfies FlowState);
      return [draftBubble(draft, state.source)];
    }
    case "fill":
    case "edit": {
      const contact = await getContact(ctx, state.contactId);
      if (!contact) {
        await saveSession(ctx, null);
        return [text("找不到這位人脈了（可能已刪除）。", MAIN_QUICK)];
      }
      const field = state.flow === "fill" ? state.queue[0] : state.field;
      let updated = contact;
      if (!skip) {
        const { patch, error } = parseAnswer(field, input, contact);
        if (error) return [text(error, STOP_QUICK)];
        updated = await updateContact(ctx, contact.id, patch!);
      }
      if (state.flow === "edit") {
        await saveSession(ctx, null);
        return [text(skip ? "好，沒有更改。" : `✅ 已更新${FIELD_LABELS[field]}`), carousel(updated.name, [contactBubble(updated)], MAIN_QUICK)];
      }
      return askNextFill(ctx, updated, state.queue.slice(1));
    }
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export async function handleText(ctx: BotCtx, input: string): Promise<LineMessage[]> {
  const intent = parseIntent(input);
  const state = await loadSession<FlowState>(ctx);
  // Anything that reads as a command ("新增 …", "待辦 …", "今日") starts that
  // command; only free text is treated as the answer to the pending question.
  if (state && intent.kind === "unknown") return handleFlowAnswer(ctx, state, input);
  return runIntent(ctx, intent);
}

export async function handlePostback(ctx: BotCtx, data: string): Promise<LineMessage[]> {
  const p = new URLSearchParams(data);
  const a = p.get("a");
  const id = p.get("id") ?? "";

  switch (a) {
    case "cmd": {
      const c = p.get("c");
      if (c === "add") return startAddContact(ctx, "");
      if (c === "add_named") return startAddContact(ctx, p.get("n") ?? "");
      if (c === "search") {
        await saveSession(ctx, { flow: "await_search" } satisfies FlowState);
        return [text("要找誰？輸入名字、公司或電話都可以。", [postback("取消", { a: "stop" }, "取消")])];
      }
      const map: Record<string, Intent> = {
        today: { kind: "today" },
        tasks: { kind: "list_tasks" },
        birthdays: { kind: "birthdays" },
        reminders: { kind: "list_reminders" },
        contacts: { kind: "list_contacts" },
        help: { kind: "help" },
      };
      return runIntent(ctx, map[c ?? ""] ?? { kind: "help" });
    }
    case "stop":
      await saveSession(ctx, null);
      return [text("好，先這樣。", MAIN_QUICK)];
    case "contact": {
      const contact = await getContact(ctx, id);
      return contact ? contactCards([contact]) : [text("找不到這位人脈。")];
    }
    case "more": {
      const contact = await getContact(ctx, id);
      return contact ? [contactMoreMenu(contact)] : [text("找不到這位人脈。")];
    }
    case "fill": {
      const contact = await getContact(ctx, id);
      if (!contact) return [text("找不到這位人脈。")];
      return askNextFill(ctx, contact, missingFields(contact));
    }
    case "edit": {
      const contact = await getContact(ctx, id);
      if (!contact) return [text("找不到這位人脈。")];
      const field = (p.get("f") ?? "notes") as EditableField;
      await saveSession(ctx, { flow: "edit", contactId: id, field } satisfies FlowState);
      return [questionFor(field, contact)];
    }
    case "star": {
      const contact = await getContact(ctx, id);
      if (!contact) return [text("找不到這位人脈。")];
      const updated = await updateContact(ctx, id, { is_important: !contact.is_important });
      return [text(updated.is_important ? `★ 已把 ${updated.name} 設為重要人脈` : `已取消 ${updated.name} 的重要標記`, MAIN_QUICK)];
    }
    case "del": {
      const contact = await getContact(ctx, id);
      if (!contact) return [text("找不到這位人脈。")];
      await saveSession(ctx, { flow: "confirm_delete", contactId: id } satisfies FlowState);
      return [
        text(`確定要刪除「${contact.name}」？相關提醒會一起刪除，無法復原。`, [
          postback("🗑 確定刪除", { a: "delok", id }, `刪除 ${contact.name}`),
          postback("取消", { a: "stop" }, "取消"),
        ]),
      ];
    }
    case "delok": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "confirm_delete" || state.contactId !== id) return [text("這個刪除確認已過期，請重新操作。")];
      const contact = await getContact(ctx, id);
      await deleteContact(ctx, id);
      await saveSession(ctx, null);
      return [text(`已刪除「${contact?.name ?? ""}」。`, MAIN_QUICK)];
    }
    case "task": {
      const contact = id ? await getContact(ctx, id) : null;
      await saveSession(ctx, { flow: "await_task", contactId: contact?.id } satisfies FlowState);
      return [text(`${contact ? `幫 ${contact.name} ` : ""}要做什麼？可以加日期，例如「明天寄報價」。`, [postback("取消", { a: "stop" }, "取消")])];
    }
    case "task_done": {
      const title = await setTaskStatus(ctx, id, "completed");
      return [text(title ? `✅ 完成：${title}` : "找不到這個待辦。", [postback("看待辦", { a: "cmd", c: "tasks" }, "待辦")])];
    }
    case "rem_done":
    case "rem_skip": {
      await setReminderStatus(ctx, [id], a === "rem_done" ? "completed" : "skipped");
      return [text(a === "rem_done" ? "✅ 已標記完成" : "已略過這則提醒", MAIN_QUICK)];
    }
    case "fest":
    case "fest_done": {
      const festival = p.get("k") as FestivalKey;
      const year = Number(p.get("y"));
      const reminders = await listPendingReminders(ctx, { dueOnOrBefore: `${year + 1}-12-31`, festivalKey: festival, year });
      if (a === "fest_done") {
        await setReminderStatus(ctx, reminders.map((r) => r.id), "completed");
        return [text(`✅ ${FESTIVAL_LABELS[festival]}問候已全部標記完成（${reminders.length} 位）`, MAIN_QUICK)];
      }
      const withContact = reminders.filter((r) => r.contact);
      if (withContact.length === 0) return [text("這個節日的問候都完成了 🎉", MAIN_QUICK)];
      const bubbles = withContact.slice(0, 10).map((r) =>
        sendMessageBubble({
          title: `${FESTIVAL_LABELS[festival]} · ${r.contact!.name}`,
          subtitle: r.contact!.title ?? undefined,
          messageText: greetingText(festival, r.contact!, 0),
          contact: r.contact!,
          kind: festival,
          variant: 0,
          reminderId: r.id,
          accent: "#a83232",
        }),
      );
      return [
        text(`${FESTIVAL_LABELS[festival]}要問候 ${withContact.length} 位${withContact.length > 10 ? "，先列前 10 位" : ""}：`),
        carousel(`${FESTIVAL_LABELS[festival]}問候`, bubbles),
      ];
    }
    case "msg":
    case "copy": {
      const kind = (p.get("k") ?? "hello") as GreetingKind;
      const variant = Number(p.get("v") ?? 0);
      const contact = id ? await getContact(ctx, id) : null;
      if (id && !contact) return [text("找不到這位人脈。")];
      const message = greetingText(kind, contact, variant);
      if (a === "copy") return [text("長按下面這則訊息即可複製 👇"), text(message)];
      if (!p.get("k") && contact) return [greetingKindPicker(contact.id)];
      return [
        carousel(
          `${GREETING_LABELS[kind]}`,
          [
            sendMessageBubble({
              title: contact ? `${GREETING_LABELS[kind]} · ${contact.name}` : GREETING_LABELS[kind],
              messageText: message,
              contact,
              kind,
              variant,
              reminderId: p.get("r") ?? undefined,
            }),
          ],
          contact
            ? (Object.keys(GREETING_LABELS) as GreetingKind[])
                .filter((k) => k !== kind)
                .map((k) => postback(GREETING_LABELS[k], { a: "msg", id: contact.id, k }))
            : undefined,
        ),
      ];
    }
    case "draft_ok": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "draft") return [text("這份資料已過期，請重新傳一次。", MAIN_QUICK)];
      if (!state.draft.name) {
        await saveSession(ctx, { ...state, editing: "name" });
        return [text("這位的名字是？", STOP_QUICK)];
      }
      return createFromDraft(ctx, state.draft);
    }
    case "draft_edit": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "draft") return [text("這份資料已過期，請重新傳一次。", MAIN_QUICK)];
      const field = p.get("f") === "company" ? "company" : "name";
      await saveSession(ctx, { ...state, editing: field });
      return [text(field === "name" ? "正確的名字是？" : "請輸入「公司 職稱」，例如：台積電 經理", STOP_QUICK)];
    }
    case "merge": {
      // Fold a pending screenshot draft into an existing contact: only fills
      // empty fields (never overwrites what you already typed), appends notes.
      const state = await loadSession<FlowState>(ctx);
      const contact = await getContact(ctx, id);
      if (state?.flow !== "draft" || !contact) return [text("這份資料已過期，請重新傳一次截圖。", MAIN_QUICK)];
      const patch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(state.draft)) {
        if (value === undefined || key === "name" || key === "notes") continue;
        if (!contact[key as keyof ContactForCard]) patch[key] = value;
      }
      if (state.draft.notes) patch.notes = contact.notes ? `${contact.notes}\n${state.draft.notes}` : state.draft.notes;
      const updated = Object.keys(patch).length > 0 ? await updateContact(ctx, id, patch) : contact;
      await saveSession(ctx, null);
      return [text(`✅ 已把截圖資料併入「${updated.name}」`), carousel(updated.name, [contactBubble(updated)], MAIN_QUICK)];
    }
    case "draft_cancel":
      await saveSession(ctx, null);
      return [text("好，不建立。", MAIN_QUICK)];
    default:
      return helpMessages();
  }
}

/**
 * Screenshot → contact in one step (no confirmation card): create it right
 * away, offer a one-tap rename / delete in case OCR misread it, then ask for
 * whatever is still missing. Falls back to the confirmation card when the
 * name is unknown or someone with that name / LINE name already exists.
 */
export async function createFromScreenshot(ctx: BotCtx, draft: ContactDraft): Promise<LineMessage[]> {
  if (!draft.name) return proposeDraft(ctx, draft, "從圖片辨識（請補名字）");
  // Exact name / LINE-name matches, plus existing contacts whose name appears
  // inside the display name ("Kenny" ⊂ "Kenny吳副 @印度班加").
  const mentioned = await contactsMentionedIn(ctx, `${draft.line_display_name ?? ""} ${draft.name}`);
  const candidates = [
    ...(await findContactByExactName(ctx, draft.name)),
    ...(draft.line_display_name ? await findContactByExactName(ctx, draft.line_display_name) : []),
    ...(await Promise.all(mentioned.slice(0, 3).map((m) => getContact(ctx, m.id)))).filter((c): c is ContactForCard => Boolean(c)),
  ];
  if (candidates.length > 0) {
    const unique = [...new Map(candidates.map((c) => [c.id, c])).values()].slice(0, 3);
    await saveSession(ctx, { flow: "draft", draft, source: "從圖片辨識" } satisfies FlowState);
    return [
      text(`截圖是「${draft.line_display_name ?? draft.name}」，是已經在人脈裡的這位嗎？`),
      carousel(draft.name, unique.map(contactBubble), [
        ...unique.map((c) => postback(`是 ${c.name}`.slice(0, 20), { a: "merge", id: c.id }, `是 ${c.name}，合併資料`)),
        postback("都不是，新增", { a: "draft_ok" }, "都不是，新增一位"),
      ]),
    ];
  }

  const contact = await createContact(ctx, draft);
  const notice = noticeCard(
    `已建立 ${contact.name}`,
    `✅ 已從截圖建立「${contact.name}」`,
    contact.line_display_name ? `LINE 名稱：${contact.line_display_name}` : undefined,
    [
      postback("✏️ 名字不對，改一下", { a: "edit", id: contact.id, f: "name" }),
      postback("🗑 認錯了，刪除", { a: "del", id: contact.id }),
    ],
  );
  const missing = missingFields(contact);
  if (missing.length === 0) {
    await saveSession(ctx, null);
    return [notice, carousel(contact.name, [contactBubble(contact)], MAIN_QUICK)];
  }
  return askNextFill(ctx, contact, missing, [notice]);
}

/** Shared by OCR and typed contact info: stash the draft and ask for confirmation. */
export async function proposeDraft(ctx: BotCtx, draft: ContactDraft, source: string): Promise<LineMessage[]> {
  await saveSession(ctx, { flow: "draft", draft, source } satisfies FlowState);
  const intro: LineMessage[] = [];
  if (draft.name) {
    const duplicates = await findContactByExactName(ctx, draft.name);
    if (duplicates.length > 0) intro.push(text(`⚠ 已有同名的「${draft.name}」，確認後會另外新增一位。`));
  }
  return [...intro, draftBubble(draft, source)];
}
