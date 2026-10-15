import "server-only";

import type { LineMessage } from "@/lib/line/api";
import {
  MAIN_QUICK,
  type ContactForCard,
  carousel,
  draftBubble,
  greetingKindPicker,
  helpMessages,
  noticeCard,
  postback,
  sendMessageBubble,
  taskListBubble,
  text,
  uri,
} from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";
import { contactFormUrl, newContactFormUrl, newTaskFormUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";
import { aiComplete, isAiConfigured } from "@/lib/ai/openrouter";
import { generateReminders } from "@/lib/reminders/generate";
import { listOccasions } from "@/lib/reminders/occasions";

import {
  type BotCtx,
  appendNote,
  contactsMentionedIn,
  createContact,
  createInteraction,
  createMeeting,
  createTask,
  deleteContact,
  findContactByExactName,
  getContact,
  lastTouchFor,
  listInteractions,
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
import { handleBatchPostback } from "./batch-chat";
import { extractDueDate, formatShortDate } from "./dates";
import { birthdayBubble, buildDigest, festivalGroupBubble, keepInTouchMessages, otherReminderBubble } from "./digest";
import { card, cards } from "./cards";
import { milestoneMessages } from "./chat-milestones";
import { type ContactDraft, extractContactFields, extractFromCommand, normalizeText } from "./extract";
import { type Intent, parseIntent } from "./intent";
import { type CollectState, appendToCollect, finalizeByName, finalizeNew, finalizeToContact, startCollect } from "./forward";
import { GREETING_LABELS, type GreetingKind, greetingText, salutation } from "./templates";
import { findSocialLinks } from "./social";
import {
  type PostNoteState,
  type PostWaitState,
  type SocialState,
  addPostNote,
  answerWhose,
  assignSocial,
  logPost,
  receivePost,
  receiveSocialLink,
  startPost,
} from "./social-flow";

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

export type FlowState =
  | { flow: "draft"; draft: ContactDraft; source: string; editing?: "name" | "company" }
  | { flow: "await_add" }
  | { flow: "await_search" }
  | { flow: "confirm_delete"; contactId: string }
  | CollectState
  | SocialState
  | PostWaitState
  | PostNoteState;

const CANCEL_QUICK = [postback("取消", { a: "stop" }, "取消")];

/**
 * Editing happens in a one-screen form (signed link, opens over the chat)
 * instead of question-by-question chat — keeps the conversation clean.
 */
function editFormNotice(contact: Pick<ContactForCard, "id" | "name">): LineMessage {
  if (!isLinkSigningConfigured()) {
    return text(`請到網頁編輯「${contact.name}」：`, [uri("開啟網頁", webUrl(`/contacts/${contact.id}`))!]);
  }
  return noticeCard(`編輯 ${contact.name}`, `✏️ ${contact.name}`, "所有欄位一次填完，存檔後自動關閉", [
    uri("開啟編輯表單", contactFormUrl(contact.id))!,
  ]);
}

// ---------------------------------------------------------------------------
// Contact creation
// ---------------------------------------------------------------------------

async function createFromDraft(ctx: BotCtx, draft: ContactDraft): Promise<LineMessage[]> {
  const contact = await createContact(ctx, draft);
  await saveSession(ctx, null);
  return [text(`✅ 已建立「${contact.name}」，缺的資料按「📇 補資料」一次填完：`), carousel(contact.name, [await card(ctx, contact)], MAIN_QUICK)];
}

async function startAddContact(ctx: BotCtx, args: string): Promise<LineMessage[]> {
  if (!args.trim()) {
    await saveSession(ctx, { flow: "await_add" } satisfies FlowState);
    return [
      text(
        "直接打一行就好，例如：\n王小明 台積電 經理 0912345678 生日3/4\n\n📝 或用表單一次填完\n📷 傳名片／好友個人頁截圖，直接建檔\n💬 到他的聊天室長按訊息 →「轉傳」給我",
        [...(isLinkSigningConfigured() ? [uri("📝 用表單新增", newContactFormUrl())!] : []), ...CANCEL_QUICK],
      ),
    ];
  }
  const draft = extractFromCommand(args);
  if (!draft.name) {
    await saveSession(ctx, { flow: "draft", draft, source: "文字輸入", editing: "name" } satisfies FlowState);
    return [text("這位的名字是？", CANCEL_QUICK)];
  }
  const duplicates = await findContactByExactName(ctx, draft.name);
  if (duplicates.length > 0) {
    await saveSession(ctx, { flow: "draft", draft, source: "文字輸入" } satisfies FlowState);
    return [
      text(`已經有 ${duplicates.length} 位叫「${draft.name}」的人脈：`),
      carousel(draft.name, await Promise.all(duplicates.map((c) => card(ctx, c)))),
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
  return cards(ctx, contacts, contacts.length > 1 ? `找到 ${contacts.length} 位：` : undefined);
}

async function showTasks(ctx: BotCtx): Promise<LineMessage[]> {
  const { tasks, total } = await listPendingTasks(ctx, { limit: 10 });
  if (total === 0) {
    return [
      text("目前沒有待辦 🎉\n新增請打：待辦 內容 日期，例如「待辦 寄報價給王小明 明天」", [
        ...(isLinkSigningConfigured() ? [uri("📝 新增待辦", newTaskFormUrl())!] : []),
        ...MAIN_QUICK,
      ]),
    ];
  }
  return [
    carousel("待辦清單", [taskListBubble(tasks, `📝 待辦（${total}）`, ctx.today)], [
      ...(isLinkSigningConfigured() ? [uri("📝 新增待辦", newTaskFormUrl())!] : []),
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
  for (const list of festivals.values()) {
    dated.push({ due: list[0].due_date, bubble: festivalGroupBubble(list[0].festival_key!, list[0].occurrence_year!, list) });
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
        ? [
            ...(isLinkSigningConfigured() ? [uri("📝 加後續待辦", newTaskFormUrl(mentioned[0].id))!] : []),
            ...MAIN_QUICK.slice(0, 3),
          ]
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

/**
 * A quick log of one touch ("交流 王小明 聊到他兒子要考學測") — separate from
 * `notes` (durable facts) and `meetings` (formal, possibly multi-contact).
 * Shows the *previous* touch back, so logging one also surfaces the last one.
 */
async function logInteraction(ctx: BotCtx, name: string, input: string): Promise<LineMessage[]> {
  const matches = await findContactByExactName(ctx, name);
  const contact = matches[0] ?? (await searchContacts(ctx, name, 1))[0];
  if (!contact) {
    return [text(`找不到「${name}」，要先新增嗎？`, [postback(`新增「${name.slice(0, 10)}」`, { a: "cmd", c: "add_named", n: name.slice(0, 50) }, `新增 ${name}`)])];
  }
  const previous = await lastTouchFor(ctx, contact.id);
  const { date, rest } = extractDueDate(input, ctx.today);
  const occurredOn = date && date <= ctx.today ? date : ctx.today;
  const content = rest || input;
  await createInteraction(ctx, contact.id, content, occurredOn);
  return [
    text(
      [`📝 已記錄跟 ${contact.name} 的交流（${formatShortDate(occurredOn)}）`, previous ? `💬 上次（${formatShortDate(previous.occurred_on)}）：${previous.content.slice(0, 80)}` : null]
        .filter(Boolean)
        .join("\n"),
      MAIN_QUICK,
    ),
  ];
}

async function showHistory(ctx: BotCtx, name: string): Promise<LineMessage[]> {
  const matches = await findContactByExactName(ctx, name);
  const contact = matches[0] ?? (await searchContacts(ctx, name, 1))[0];
  if (!contact) return [text(`找不到「${name}」。`, MAIN_QUICK)];
  const history = await listInteractions(ctx, contact.id, 10);
  if (history.length === 0) {
    return [text(`還沒有跟 ${contact.name} 的交流紀錄。打「交流 ${contact.name} ...」開始記。`, MAIN_QUICK)];
  }
  const icon = { chat: "💬", post: "📣", sent: "✉️" } as const;
  const lines = history.map((h) => `${icon[h.kind] ?? "💬"} ${formatShortDate(h.occurred_on)}：${h.content.slice(0, 100)}`);
  return [text(`${contact.name} 的溝通節點（最近 ${history.length} 筆）：\n${lines.join("\n")}`, MAIN_QUICK)];
}

async function handleUnknown(ctx: BotCtx, input: string): Promise<LineMessage[]> {
  const exact = await findContactByExactName(ctx, input);
  if (exact.length > 0) return cards(ctx, exact);
  // Anything else is most likely a message forwarded from a friend's chat (or
  // pasted details): park it and ask whose conversation it is.
  return appendToCollect(ctx, null, [input]);
}

async function runIntent(ctx: BotCtx, intent: Intent): Promise<LineMessage[]> {
  await saveSession(ctx, null);
  switch (intent.kind) {
    case "help":
      return helpMessages();
    case "today": {
      return (await buildDigest(ctx, { alwaysShow: true })).messages;
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
      return cards(ctx, contacts, `共 ${total} 位人脈，最近新增的 ${contacts.length} 位：`);
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
    case "interaction":
      return logInteraction(ctx, intent.name, intent.text);
    case "history":
      return showHistory(ctx, intent.name);
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
    case "collect_start":
      return startCollect(ctx);
    case "post": {
      if (!intent.name) return startPost(ctx);
      if (!intent.text) return startPost(ctx, intent.name);
      const link = findSocialLinks(intent.text)[0];
      if (link) {
        const contact = (await findContactByExactName(ctx, intent.name))[0] ?? (await searchContacts(ctx, intent.name, 1))[0];
        return receivePost(ctx, { flow: "post_wait", contactId: contact?.id }, { link, text: intent.text });
      }
      return logPost(ctx, intent.name, intent.text);
    }
    case "keep_in_touch":
      return keepInTouchMessages(ctx);
    case "collect_target":
      return handleUnknown(ctx, intent.text);
    case "unknown":
      return handleUnknown(ctx, intent.text);
  }
}

// ---------------------------------------------------------------------------
// Answers to an in-progress flow
// ---------------------------------------------------------------------------

async function handleFlowAnswer(ctx: BotCtx, state: FlowState, input: string): Promise<LineMessage[]> {
  switch (state.flow) {
    case "await_add":
      return startAddContact(ctx, input);
    case "await_search":
      await saveSession(ctx, null);
      return showSearch(ctx, input);
    case "collect":
      return appendToCollect(ctx, state, [input]);
    case "confirm_delete":
      await saveSession(ctx, null);
      return [text("已取消刪除。", MAIN_QUICK)];
    case "social":
      return answerWhose(ctx, state, input);
    case "post_wait":
      return receivePost(ctx, state, { link: findSocialLinks(input)[0], text: input });
    case "post_note":
      // Only a short one-liner reads as "the gist of that post"; anything
      // longer is most likely a forwarded message — handle it as usual.
      if (input.length <= 80 && !input.includes("\n")) return addPostNote(ctx, state, input);
      await saveSession(ctx, null);
      return handleUnknown(ctx, input);
    case "draft": {
      const draft = { ...state.draft };
      if (state.editing === "name") {
        if (!input.trim()) return [text("建立人脈至少要有名字喔，這位的名字是？", CANCEL_QUICK)];
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
  if (state?.flow === "collect") {
    if (intent.kind === "collect_target") return finalizeByName(ctx, state, intent.name);
    if (intent.kind === "unknown") {
      return state.awaitingName ? finalizeNew(ctx, state, input) : appendToCollect(ctx, state, [input]);
    }
  }
  if (state && state.flow !== "collect" && intent.kind === "unknown") return handleFlowAnswer(ctx, state, input);
  // A LinkedIn / Facebook link (pasted, or shared from the app): a profile to
  // save on someone's card, or a post of theirs to keep on their timeline.
  if (intent.kind === "unknown") {
    const link = findSocialLinks(input)[0];
    if (link) return receiveSocialLink(ctx, link, input);
  }
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
        collect: { kind: "collect_start" },
        keep: { kind: "keep_in_touch" },
        post: { kind: "post" },
        help: { kind: "help" },
      };
      return runIntent(ctx, map[c ?? ""] ?? { kind: "help" });
    }
    case "batch_ok":
    case "batch_cancel":
      return handleBatchPostback(ctx, a);
    // Switching rich-menu tabs also sends a postback; nothing to answer.
    case "tab":
      return [];
    case "soc_to": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "social") return [text("這個選項已過期，請重新貼一次連結。", MAIN_QUICK)];
      return assignSocial(ctx, state, id);
    }
    case "nodes": {
      const nodes = await milestoneMessages(ctx, p.get("i") ?? "", { deadline: Date.now() + 45_000 });
      return nodes.ok ? [carousel("溝通節點", [nodes.bubble])] : [text(nodes.note, [nodes.retry])];
    }
    case "stop":
      await saveSession(ctx, null);
      return [text("好，先這樣。", MAIN_QUICK)];
    case "contact": {
      const contact = await getContact(ctx, id);
      return contact ? cards(ctx, [contact]) : [text("找不到這位人脈。")];
    }
    // Buttons on cards sent before the form existed ("補資料", "⋯ 更多", "改…").
    case "more":
    case "fill":
    case "edit": {
      const contact = await getContact(ctx, id);
      return contact ? [editFormNotice(contact)] : [text("找不到這位人脈。")];
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
      const hint = `也可以直接打：待辦 ${contact ? `${contact.name} ` : ""}寄報價 明天`;
      if (!isLinkSigningConfigured()) return [text(hint, MAIN_QUICK)];
      return [noticeCard("新增待辦", `📝 新增待辦${contact ? ` · ${contact.name}` : ""}`, hint, [uri("開啟待辦表單", newTaskFormUrl(contact?.id))!])];
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
      const occasionName = p.get("k") ?? "";
      const year = Number(p.get("y"));
      const reminders = await listPendingReminders(ctx, { dueOnOrBefore: `${year + 1}-12-31`, festivalKey: occasionName, year });
      if (a === "fest_done") {
        await setReminderStatus(ctx, reminders.map((r) => r.id), "completed");
        return [text(`✅ ${occasionName}問候已全部標記完成（${reminders.length} 位）`, MAIN_QUICK)];
      }
      const withContact = reminders.filter((r) => r.contact);
      if (withContact.length === 0) return [text("這個節日的問候都完成了 🎉", MAIN_QUICK)];
      const bubbles = withContact.slice(0, 10).map((r) =>
        sendMessageBubble({
          title: `${occasionName} · ${r.contact!.name}`,
          subtitle: r.contact!.title ?? undefined,
          messageText: greetingText("festival", r.contact!, 0, occasionName),
          contact: r.contact!,
          kind: "festival",
          occasionName,
          variant: 0,
          reminderId: r.id,
          aiAvailable: isAiConfigured(),
        }),
      );
      return [
        text(`${occasionName}要問候 ${withContact.length} 位${withContact.length > 10 ? "，先列前 10 位" : ""}：`),
        carousel(`${occasionName}問候`, bubbles),
      ];
    }
    case "msg":
    case "copy": {
      const kind = (p.get("k") ?? "hello") as GreetingKind;
      const occasionName = p.get("o") ?? undefined;
      const variant = Number(p.get("v") ?? 0);
      const contact = id ? await getContact(ctx, id) : null;
      if (id && !contact) return [text("找不到這位人脈。")];
      const message = greetingText(kind, contact, variant, occasionName);
      if (a === "copy") return [text("長按下面這則訊息即可複製 👇"), text(message)];
      if (!p.get("k") && contact) {
        const occasions = await listOccasions({ supabase: ctx.supabase, ownerId: ctx.ownerId }, { enabledOnly: true });
        return [greetingKindPicker(contact.id, occasions.map((o) => o.name))];
      }
      const label = kind === "festival" && occasionName ? `${occasionName}祝福` : GREETING_LABELS[kind];
      return [
        carousel(
          label,
          [
            sendMessageBubble({
              title: contact ? `${label} · ${contact.name}` : label,
              messageText: message,
              contact,
              kind,
              occasionName,
              variant,
              reminderId: p.get("r") ?? undefined,
              aiAvailable: isAiConfigured(),
            }),
          ],
        ),
      ];
    }
    case "ai_msg": {
      const kind = (p.get("k") ?? "hello") as GreetingKind;
      const occasionName = p.get("o") ?? undefined;
      const reminderId = p.get("r") ?? undefined;
      const contact = id ? await getContact(ctx, id) : null;
      if (!contact) return [text("找不到這位人脈。")];
      const label = kind === "festival" && occasionName ? `${occasionName}祝福` : GREETING_LABELS[kind];
      const touch = await lastTouchFor(ctx, contact.id);
      const occasion = kind === "festival" ? (occasionName ?? "節日") : kind === "birthday" ? "生日" : "近況問候";
      const prompt = [
        `幫我用繁體中文寫一句傳給朋友的 LINE 訊息，場合是：${occasion}。`,
        `對方稱呼：${salutation(contact)}；${contact.role_type === "boss" ? "語氣正式、有禮貌" : "語氣輕鬆、自然"}。`,
        touch ? `我們最近一次聊到：「${touch.content.slice(0, 100)}」，如果合適可以自然地提到，讓對方感覺到我有在關心他。` : "",
        "只要回一句訊息本文（不要加任何說明、引號或開頭「這是您要的」之類的話），50 字以內，可以加 1 個表情符號。",
      ]
        .filter(Boolean)
        .join("\n");
      const result = await aiComplete(prompt);
      if (!result.ok) return [text(`AI 暫時無法使用（${result.error}），先用這句：\n${greetingText(kind, contact, 0, occasionName)}`, MAIN_QUICK)];
      return [
        carousel(`${label} · ${contact.name}`, [
          sendMessageBubble({
            title: `🤖 ${label} · ${contact.name}`,
            subtitle: "AI 草稿，可以直接傳或繼續調整",
            messageText: result.text,
            contact,
            kind,
            occasionName,
            variant: 0,
            reminderId,
            aiAvailable: true,
          }),
        ]),
      ];
    }
    case "draft_ok": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "draft") return [text("這份資料已過期，請重新傳一次。", MAIN_QUICK)];
      if (!state.draft.name) {
        await saveSession(ctx, { ...state, editing: "name" });
        return [text("這位的名字是？", CANCEL_QUICK)];
      }
      return createFromDraft(ctx, state.draft);
    }
    case "draft_edit": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "draft") return [text("這份資料已過期，請重新傳一次。", MAIN_QUICK)];
      const field = p.get("f") === "company" ? "company" : "name";
      await saveSession(ctx, { ...state, editing: field });
      return [text(field === "name" ? "正確的名字是？" : "請輸入「公司 職稱」，例如：台積電 經理", CANCEL_QUICK)];
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
      return [text(`✅ 已把截圖資料併入「${updated.name}」`), carousel(updated.name, [await card(ctx, updated)], MAIN_QUICK)];
    }
    case "collect_to":
    case "collect_new":
    case "collect_cancel": {
      const state = await loadSession<FlowState>(ctx);
      if (state?.flow !== "collect") return [text("暫存的訊息已過期（30 分鐘），請重新轉傳。", MAIN_QUICK)];
      if (a === "collect_cancel") {
        await saveSession(ctx, null);
        return [text("好，不存。", MAIN_QUICK)];
      }
      if (a === "collect_to") return finalizeToContact(ctx, state, id);
      return finalizeNew(ctx, state, p.get("n") ?? undefined);
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
 * away and offer the edit form (to fix or complete it) and a one-tap delete
 * in case OCR misread it. Falls back to the confirmation card when the
 * name is unknown or someone with that name / LINE name already exists.
 */
export async function createFromScreenshot(ctx: BotCtx, draft: ContactDraft, sure = true): Promise<LineMessage[]> {
  if (!draft.name) return proposeDraft(ctx, draft, "從圖片辨識（請補名字）");
  // The name was a guess: show what was read and let the owner confirm or fix it.
  if (!sure) return proposeDraft(ctx, draft, "從圖片辨識，名字對嗎？");
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
      carousel(draft.name, await Promise.all(unique.map((c) => card(ctx, c))), [
        ...unique.map((c) => postback(`是 ${c.name}`.slice(0, 20), { a: "merge", id: c.id }, `是 ${c.name}，合併資料`)),
        postback("都不是，新增", { a: "draft_ok" }, "都不是，新增一位"),
      ]),
    ];
  }

  const contact = await createContact(ctx, draft);
  const notice = noticeCard(
    `已建立 ${contact.name}`,
    `✅ 已從截圖建立「${contact.name}」`,
    contact.line_display_name
      ? `LINE 名稱：${contact.line_display_name}`
      : contact.whatsapp_phone || contact.phone
        ? `電話：${contact.whatsapp_phone ?? contact.phone}`
        : undefined,
    [
      (isLinkSigningConfigured() ? uri("✏️ 補齊／修正資料", contactFormUrl(contact.id)) : null) ??
        postback("✏️ 補齊資料", { a: "fill", id: contact.id }),
      postback("🗑 認錯了，刪除", { a: "del", id: contact.id }),
    ],
  );
  await saveSession(ctx, null);
  return [notice];
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
