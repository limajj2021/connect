import "server-only";

import type { LineMessage } from "@/lib/line/api";
import { carousel, postback, sendMessageBubble, taskListBubble, text } from "@/lib/line/flex";
import { addDays } from "@/lib/format-date";
import { isAiConfigured } from "@/lib/ai/openrouter";

import { type BotCtx, type BotReminder, listPendingReminders, listPendingTasks } from "./data";
import { daysBetween, formatShortDate } from "./dates";
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
    accent: "#b4436c",
    aiAvailable: isAiConfigured(),
  });
}

/** `occasionName` is the greeting occasion's name (e.g. "春節", "聖誕節") — any owner-defined occasion. */
export function festivalGroupBubble(occasionName: string, year: number, reminders: BotReminder[], variant = 0) {
  const festivalDate = reminders[0]?.festival_date ?? null;
  const names = reminders.map((r) => r.contact?.name).filter(Boolean) as string[];
  const bubble = sendMessageBubble({
    title: `🧧 ${occasionName}問候（${reminders.length} 位）`,
    subtitle: `${occasionName}${festivalDate ? ` ${formatShortDate(festivalDate)}` : ""}｜${names.slice(0, 6).join("、")}${names.length > 6 ? "…" : ""}`,
    messageText: greetingText("festival", null, variant, occasionName),
    contact: null,
    kind: "festival",
    occasionName,
    variant,
    accent: "#a83232",
  });
  const footer = (bubble as { footer?: { contents: unknown[] } }).footer;
  footer?.contents.push(
    { type: "button", style: "secondary", height: "sm", action: postback("👥 逐一個人化傳送", { a: "fest", k: occasionName, y: year }) },
    { type: "button", style: "link", height: "sm", action: postback("✅ 全部已傳", { a: "fest_done", k: occasionName, y: year }, `${occasionName}全部已傳`) },
  );
  return bubble;
}

export function otherReminderBubble(reminder: BotReminder, today: string) {
  const contact = reminder.contact;
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#5b4b8a",
      paddingAll: "14px",
      contents: [
        { type: "text", text: `⏰ ${whenLabel(today, reminder.due_date)}`, weight: "bold", color: "#ffffff", wrap: true },
        ...(contact ? [{ type: "text", text: contact.name, size: "xs", color: "#dddddd" }] : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "14px",
      contents: [{ type: "text", text: reminder.notes || "提醒", wrap: true, size: "sm" }],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "10px",
      contents: [
        ...(contact
          ? [{ type: "button", style: "primary", height: "sm", action: postback("💬 傳訊息", { a: "msg", id: contact.id, k: "hello", r: reminder.id }) }]
          : []),
        { type: "button", style: "secondary", height: "sm", action: postback("✅ 完成", { a: "rem_done", id: reminder.id }, "完成") },
        { type: "button", style: "link", height: "sm", action: postback("略過", { a: "rem_skip", id: reminder.id }, "略過") },
      ],
    },
  };
}

/**
 * Builds the "today" overview: who to greet (birthdays, festivals), other due
 * reminders, and due/overdue tasks. Used by the 今日 command and the daily push
 * (which filters out reminders it already pushed).
 */
export async function buildDigest(
  ctx: BotCtx,
  opts: { skipReminderIds?: Set<string> } = {},
): Promise<{ messages: LineMessage[]; reminderKeys: { id: string; key: string }[]; hasContent: boolean }> {
  const today = ctx.today;
  const [reminders, { tasks, total: taskTotal }] = await Promise.all([
    listPendingReminders(ctx, { dueOnOrBefore: addDays(today, BIRTHDAY_LOOKAHEAD_DAYS) }),
    listPendingTasks(ctx, { dueOnOrBefore: today, limit: 10 }),
  ]);

  const reminderKeys: { id: string; key: string }[] = [];
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
    if (opts.skipReminderIds?.has(key)) continue;
    reminderKeys.push({ id: reminder.id, key });

    if (isBirthday) birthdays.push(reminder);
    else if (reminder.reminder_type === "festival" && reminder.festival_key && reminder.occurrence_year) {
      // The occasion name can contain "|" in theory, but owner-typed names in
      // practice never do; splitting back on the last "|" keeps it exact regardless.
      const groupKey = `${reminder.festival_key}|${reminder.occurrence_year}`;
      festivals.set(groupKey, [...(festivals.get(groupKey) ?? []), reminder]);
    } else others.push(reminder);
  }

  const bubbles: Record<string, unknown>[] = [
    ...birthdays.map((r) => birthdayBubble(r, today)),
    ...[...festivals.entries()].map(([, list]) => festivalGroupBubble(list[0].festival_key!, list[0].occurrence_year!, list)),
    ...others.map((r) => otherReminderBubble(r, today)),
  ];

  const summary: string[] = [];
  if (birthdays.length > 0) summary.push(`🎂 生日 ${birthdays.length} 位：${birthdays.map((b) => b.contact!.name).join("、")}`);
  for (const list of festivals.values()) {
    summary.push(`🧧 ${list[0].festival_key}問候 ${list.length} 位`);
  }
  if (others.length > 0) summary.push(`⏰ 其他提醒 ${others.length} 則`);
  if (taskTotal > 0) summary.push(`📝 今天到期／逾期待辦 ${taskTotal} 件`);

  const hasContent = bubbles.length > 0 || taskTotal > 0;
  const messages: LineMessage[] = [];
  if (hasContent) {
    messages.push(text(`早安！${formatShortDate(today)} 今天要處理：\n${summary.join("\n")}`));
    if (bubbles.length > 0) messages.push(carousel("今天要問候的人", bubbles.slice(0, 10)));
    if (bubbles.length > 10) messages.push(text(`還有 ${bubbles.length - 10} 則提醒，打「提醒」看全部。`));
    if (tasks.length > 0) messages.push(carousel("今天的待辦", [taskListBubble(tasks, `📝 待辦（${taskTotal}）`, today)]));
  }
  return { messages, reminderKeys, hasContent };
}
