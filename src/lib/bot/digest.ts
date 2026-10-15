import "server-only";

import type { LineMessage } from "@/lib/line/api";
import { THEME, cardBubble, carousel, postback, sendMessageBubble, taskListBubble, text, uri } from "@/lib/line/flex";
import { addDays } from "@/lib/format-date";
import { isAiConfigured } from "@/lib/ai/openrouter";

import { type BotCtx, type BotReminder, type LastTouch, lastTouchesFor, listPendingReminders, listPendingTasks } from "./data";
import { daysBetween, formatShortDate } from "./dates";
import { type ImportantContact, KEEP_IN_TOUCH_DAYS, RECENT_DAYS, importantContacts, keepInTouchKey, overdue } from "./keep-in-touch";
import { greetingText } from "./templates";

/** Birthdays show up this many days ahead; festival reminders already carry their lead time. */
export const BIRTHDAY_LOOKAHEAD_DAYS = 3;

/**
 * A reminder nobody confirmed sending stays `pending` forever, so without
 * this it would get pushed once (when it first becomes due) and then never
 * again — easy to lose track of. Every `FOLLOWUP_INTERVAL_DAYS` after that,
 * the push dedupe key changes, so it gets pushed again exactly once more —
 * a periodic nudge, not a daily one.
 */
export const FOLLOWUP_INTERVAL_DAYS = 7;

/** The daily-push dedupe key's stage: advances every FOLLOWUP_INTERVAL_DAYS once a reminder is overdue. */
export function reminderStage(today: string, dueDate: string): string {
  if (dueDate > today) return "early";
  const overdueDays = daysBetween(dueDate, today);
  return overdueDays < FOLLOWUP_INTERVAL_DAYS ? "due" : `followup${Math.floor(overdueDays / FOLLOWUP_INTERVAL_DAYS)}`;
}

function whenLabel(today: string, ymd: string) {
  const diff = daysBetween(today, ymd);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff > 1) return `${diff} 天後（${formatShortDate(ymd)}）`;
  return `已過 ${-diff} 天（${formatShortDate(ymd)}）`;
}

export function birthdayBubble(reminder: BotReminder, today: string, variant = 0) {
  const contact = reminder.contact!;
  return sendMessageBubble({
    title: `🎂 ${contact.name} ${whenLabel(today, reminder.due_date)}生日`,
    subtitle: contact.title ?? undefined,
    messageText: greetingText("birthday", contact, variant),
    contact,
    kind: "birthday",
    variant,
    reminderId: reminder.id,
    aiAvailable: isAiConfigured(),
  });
}

/** `occasionName` is the greeting occasion's name (e.g. "春節", "聖誕節") — any owner-defined occasion. */
export function festivalGroupBubble(occasionName: string, year: number, reminders: BotReminder[], variant = 0) {
  const festivalDate = reminders[0]?.festival_date ?? null;
  const names = reminders.map((r) => r.contact?.name).filter(Boolean) as string[];
  return sendMessageBubble({
    title: `🧧 ${occasionName}問候（${reminders.length} 位）`,
    subtitle: `${occasionName}${festivalDate ? ` ${formatShortDate(festivalDate)}` : ""}｜${names.slice(0, 6).join("、")}${names.length > 6 ? "…" : ""}`,
    messageText: greetingText("festival", null, variant, occasionName),
    contact: null,
    kind: "festival",
    occasionName,
    variant,
    extraActions: [
      postback("👥 逐一個人化傳送", { a: "fest", k: occasionName, y: year }),
      postback("✅ 全部已傳", { a: "fest_done", k: occasionName, y: year }, `${occasionName}全部已傳`),
    ],
  });
}

export function otherReminderBubble(reminder: BotReminder, today: string) {
  const contact = reminder.contact;
  return cardBubble({
    title: `⏰ ${whenLabel(today, reminder.due_date)}`,
    subtitle: contact?.name,
    body: [{ type: "text", text: reminder.notes || "提醒", wrap: true, size: "sm" }],
    buttons: [
      contact ? { action: postback("💬 傳訊息", { a: "msg", id: contact.id, k: "hello", r: reminder.id }), style: "primary" } : null,
      { action: postback("✅ 完成", { a: "rem_done", id: reminder.id }, "完成"), style: "secondary" },
      { action: postback("略過", { a: "rem_skip", id: reminder.id }, "略過"), style: "secondary" },
    ],
  });
}

/** "好久沒聯絡" — a ★ contact gone quiet, with what you last talked about so the greeting can pick up from there. */
export function keepInTouchBubble(item: ImportantContact, lastTouch?: LastTouch, latestPost?: LastTouch) {
  const { contact } = item;
  const body: Record<string, unknown>[] = [];
  if (lastTouch) body.push(touchBlock("💬 上次聊到", lastTouch));
  if (latestPost) body.push(touchBlock("📣 他最近的動態", latestPost));
  if (body.length === 0) body.push({ type: "text", text: "還沒有聊天紀錄。問候完記得打「交流 名字 聊了什麼」，下次就接得上話。", wrap: true, size: "xs", color: THEME.muted });
  const linkedin = contact.linkedin_url ? uri("🔗 LinkedIn", contact.linkedin_url) : null;
  const facebook = contact.facebook_url ? uri("🔗 Facebook", contact.facebook_url) : null;
  return cardBubble({
    title: `👋 好久沒聯絡 · ${contact.name}`,
    subtitle: item.hasHistory ? `上次聯絡 ${formatShortDate(item.lastContactOn)}，${item.daysSince} 天前` : `加入 ${item.daysSince} 天，還沒有聯絡紀錄`,
    body,
    buttons: [
      { action: postback("💬 傳個問候", { a: "msg", id: contact.id, k: "hello" }), style: "primary" },
      linkedin ? { action: linkedin, style: "secondary" } : null,
      facebook ? { action: facebook, style: "secondary" } : null,
      { action: postback("📇 看他的卡片", { a: "contact", id: contact.id }), style: "secondary" },
    ],
  });
}

function touchBlock(label: string, touch: LastTouch) {
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    contents: [
      { type: "text", text: `${label} · ${Number(touch.occurred_on.slice(5, 7))}/${Number(touch.occurred_on.slice(8, 10))}`, size: "xxs", color: THEME.muted },
      { type: "text", text: touch.content.slice(0, 80), size: "sm", wrap: true },
    ],
  };
}

/** A rounded progress bar (Flex has none built in): `done` of `total`. */
function progressBar(label: string, done: number, total: number) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    margin: "lg",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: label, size: "sm", color: THEME.ink, flex: 4 },
          { type: "text", text: `${done} / ${total}`, size: "sm", color: THEME.muted, align: "end", flex: 2 },
        ],
      },
      {
        type: "box",
        layout: "vertical",
        height: "8px",
        cornerRadius: "4px",
        backgroundColor: "#E6E6E6",
        contents: [
          {
            type: "box",
            layout: "vertical",
            height: "8px",
            cornerRadius: "4px",
            width: `${Math.max(pct, done > 0 ? 4 : 0)}%`,
            backgroundColor: THEME.brand,
            contents: [],
          },
        ],
      },
    ],
  };
}

function statRow(icon: string, label: string, value: string, muted = false) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: `${icon} ${label}`, size: "sm", color: muted ? THEME.muted : THEME.ink, flex: 3 },
      { type: "text", text: value, size: "sm", color: muted ? THEME.muted : THEME.ink, align: "end", wrap: true, flex: 4 },
    ],
  };
}

/** The 今日 dashboard: what's on today at a glance, plus how well you're keeping up with your ★ people. */
export function todayDashboard(opts: {
  today: string;
  birthdays: string[];
  festivals: { name: string; count: number }[];
  keepInTouch: string[];
  others: number;
  tasks: number;
  important: { recent: number; total: number };
}) {
  const names = (list: string[]) => (list.length === 0 ? "—" : `${list.slice(0, 3).join("、")}${list.length > 3 ? ` 等 ${list.length} 位` : ""}`);
  const todo = opts.birthdays.length + opts.festivals.length + opts.keepInTouch.length + opts.others + opts.tasks;
  return cardBubble({
    title: `今日 · ${formatShortDate(opts.today)}`,
    subtitle: todo > 0 ? "早安！今天要處理的事 👇" : "今天沒有要處理的事 🎉",
    body: [
      statRow("🎂", "生日", names(opts.birthdays), opts.birthdays.length === 0),
      statRow("🧧", "節日問候", opts.festivals.length === 0 ? "—" : opts.festivals.map((f) => `${f.name} ${f.count} 位`).join("、"), opts.festivals.length === 0),
      statRow("👋", "好久沒聯絡", names(opts.keepInTouch), opts.keepInTouch.length === 0),
      statRow("📝", "待辦到期", opts.tasks > 0 ? `${opts.tasks} 件` : "—", opts.tasks === 0),
      ...(opts.others > 0 ? [statRow("⏰", "其他提醒", `${opts.others} 則`)] : []),
      ...(opts.important.total > 0
        ? [progressBar(`★ 重要人脈 ${RECENT_DAYS} 天內有聯絡`, opts.important.recent, opts.important.total)]
        : [{ type: "text", text: "在人脈卡設 ★ 重要，久沒聯絡時我會提醒你。", size: "xxs", color: THEME.muted, wrap: true, margin: "lg" }]),
    ],
    nav: todo > 0 ? "往右滑，一張一張處理" : undefined,
  });
}

/**
 * Builds the "today" overview: who to greet (birthdays, festivals, ★ people
 * gone quiet), other due reminders, and due/overdue tasks. Used by the 今日
 * command and the daily push (which filters out what it already pushed).
 */
export async function buildDigest(
  ctx: BotCtx,
  opts: { skipKeys?: Set<string>; keepInTouchLimit?: number; /** Show the dashboard even on a quiet day (the 今日 command). */ alwaysShow?: boolean } = {},
): Promise<{ messages: LineMessage[]; deliveryKeys: { reminderId: string | null; key: string }[]; hasContent: boolean }> {
  const today = ctx.today;
  const [reminders, { tasks, total: taskTotal }, important] = await Promise.all([
    listPendingReminders(ctx, { dueOnOrBefore: addDays(today, BIRTHDAY_LOOKAHEAD_DAYS) }),
    listPendingTasks(ctx, { dueOnOrBefore: today, limit: 10 }),
    importantContacts(ctx),
  ]);

  const deliveryKeys: { reminderId: string | null; key: string }[] = [];
  const birthdays: BotReminder[] = [];
  const festivals = new Map<string, BotReminder[]>();
  const others: BotReminder[] = [];

  for (const reminder of reminders) {
    const isBirthday = reminder.reminder_type === "birthday";
    // Festival/custom reminders are due on their (already lead-adjusted) date;
    // only birthdays are surfaced a few days early.
    if (!isBirthday && reminder.due_date > today) continue;
    if (isBirthday && !reminder.contact) continue;
    const stage = reminderStage(today, reminder.due_date);
    const key = `line:reminder:${reminder.id}:${stage}`;
    if (opts.skipKeys?.has(key)) continue;
    deliveryKeys.push({ reminderId: reminder.id, key });

    if (isBirthday) birthdays.push(reminder);
    else if (reminder.reminder_type === "festival" && reminder.festival_key && reminder.occurrence_year) {
      // The occasion name can contain "|" in theory, but owner-typed names in
      // practice never do; splitting back on the last "|" keeps it exact regardless.
      const groupKey = `${reminder.festival_key}|${reminder.occurrence_year}`;
      festivals.set(groupKey, [...(festivals.get(groupKey) ?? []), reminder]);
    } else others.push(reminder);
  }

  // ★ people gone quiet: a couple a day (the longest-silent first), each
  // nudged again at most every couple of weeks, so it never becomes a wall.
  const greetedToday = new Set(birthdays.map((b) => b.contact!.id));
  const stale = overdue(important)
    .filter((item) => !greetedToday.has(item.contact.id))
    .filter((item) => !opts.skipKeys?.has(keepInTouchKey(item.contact.id, today)))
    .slice(0, opts.keepInTouchLimit ?? 3);
  for (const item of stale) deliveryKeys.push({ reminderId: null, key: keepInTouchKey(item.contact.id, today) });
  const staleIds = stale.map((s) => s.contact.id);
  const [chatTouches, postTouches] = await Promise.all([lastTouchesFor(ctx, staleIds, "chat"), lastTouchesFor(ctx, staleIds, "post")]);

  const bubbles: Record<string, unknown>[] = [
    ...birthdays.map((r) => birthdayBubble(r, today)),
    ...[...festivals.entries()].map(([, list]) => festivalGroupBubble(list[0].festival_key!, list[0].occurrence_year!, list)),
    ...stale.map((item) => keepInTouchBubble(item, chatTouches.get(item.contact.id), postTouches.get(item.contact.id))),
    ...others.map((r) => otherReminderBubble(r, today)),
  ];

  const hasContent = bubbles.length > 0 || taskTotal > 0;
  const messages: LineMessage[] = [];
  if (hasContent || opts.alwaysShow) {
    const dashboard = todayDashboard({
      today,
      birthdays: birthdays.map((b) => b.contact!.name),
      festivals: [...festivals.values()].map((list) => ({ name: list[0].festival_key!, count: list.length })),
      keepInTouch: stale.map((s) => s.contact.name),
      others: others.length,
      tasks: taskTotal,
      important: { recent: important.filter((i) => i.hasHistory && i.daysSince <= RECENT_DAYS).length, total: important.length },
    });
    // The dashboard leads the carousel, so one swipe goes from overview to the first person.
    messages.push(carousel(hasContent ? "今天要處理的事" : "今天沒有要處理的事", [dashboard, ...bubbles].slice(0, 12)));
    if (bubbles.length > 11) messages.push(text(`還有 ${bubbles.length - 11} 則提醒，打「提醒」看全部。`));
    if (tasks.length > 0) messages.push(carousel("今天的待辦", [taskListBubble(tasks, `📝 待辦（${taskTotal}）`, today)]));
  }
  return { messages, deliveryKeys, hasContent };
}

/** 久沒聯絡: every ★ person gone quiet, longest first. */
export async function keepInTouchMessages(ctx: BotCtx): Promise<LineMessage[]> {
  const important = await importantContacts(ctx);
  if (important.length === 0) {
    return [text("還沒有 ★ 重要人脈。在人脈卡「📇 詳細」裡勾選重要，好久沒聯絡時我會提醒你。")];
  }
  const stale = overdue(important).slice(0, 10);
  if (stale.length === 0) {
    return [text(`★ 重要人脈 ${important.length} 位，${KEEP_IN_TOUCH_DAYS} 天內都有聯絡 👍`)];
  }
  const ids = stale.map((s) => s.contact.id);
  const [chats, posts] = await Promise.all([lastTouchesFor(ctx, ids, "chat"), lastTouchesFor(ctx, ids, "post")]);
  return [
    carousel(
      "好久沒聯絡",
      stale.map((item) => keepInTouchBubble(item, chats.get(item.contact.id), posts.get(item.contact.id))),
    ),
  ];
}
