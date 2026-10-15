import "server-only";

import { aiComplete, extractJsonObject, hasSimplifiedChinese, isAiConfigured } from "@/lib/ai/openrouter";
import { showLoading } from "@/lib/line/api";
import { THEME, cardBubble, postback, uri } from "@/lib/line/flex";
import { contactFormUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";

import { type BotCtx, createTask } from "./data";
import { type ChatLine, type ChatPromise, type Milestone, buildTranscript, milestonePrompt, parseMilestoneReply } from "./milestones";

/** Who a milestone belongs to, resolved to a contact. */
export interface SavedMilestone extends Milestone {
  contactId: string;
}

export type AnalyzeResult =
  | { ok: true; milestones: SavedMilestone[]; promises: (ChatPromise & { contactId: string })[]; contacts: { id: string; name: string }[] }
  | { ok: false; error: string; contacts: { id: string; name: string }[] };

/**
 * How long a reply waits for the free model. The webhook has 60s in total and
 * the import itself takes a few, so this leaves room for the reply to go out.
 */
export const MILESTONE_BUDGET_MS = 38_000;

/** Forwarded messages are stored with this speaker (see forward.ts) — sender unknown. */
const FORWARDED_SPEAKER = "轉傳";

/**
 * Reads one stored chat (TXT import or forwarded messages), asks a free model
 * for its 溝通節點, and saves them on each person's timeline — replacing any
 * earlier analysis of the same chat, so re-running never piles up duplicates.
 * Promises ("我答應…") become tasks on that contact. Never throws for AI
 * trouble; the caller shows a retry button instead.
 */
export async function analyzeChatImport(ctx: BotCtx, importId: string, opts: { deadline?: number } = {}): Promise<AnalyzeResult> {
  const { data: chatImport, error: importError } = await ctx.supabase
    .from("chat_imports")
    .select("id, chat_type, primary_contact_id")
    .eq("owner_id", ctx.ownerId)
    .eq("id", importId)
    .maybeSingle();
  if (importError) throw importError;
  if (!chatImport) return { ok: false, error: "找不到這份聊天紀錄", contacts: [] };

  const { data: participants, error: participantError } = await ctx.supabase
    .from("chat_participants")
    .select("display_name, contact:contacts(id, name)")
    .eq("chat_import_id", importId)
    .not("contact_id", "is", null);
  if (participantError) throw participantError;
  const contacts = new Map<string, { id: string; name: string }>();
  const bySpeaker = new Map<string, { id: string; name: string }>();
  for (const p of (participants ?? []) as unknown as { display_name: string; contact: { id: string; name: string } | null }[]) {
    if (!p.contact) continue;
    contacts.set(p.contact.id, p.contact);
    bySpeaker.set(p.display_name, p.contact);
    bySpeaker.set(p.contact.name, p.contact);
  }
  const contactList = [...contacts.values()];
  if (contactList.length === 0) return { ok: false, error: "這段對話沒有對應到任何人脈", contacts: [] };
  if (!isAiConfigured()) return { ok: false, error: "AI 還沒設定（OPENROUTER_API_KEY）", contacts: contactList };

  const { data: rows, error: messageError } = await ctx.supabase
    .from("chat_messages")
    .select("speaker_display_name, contact_id, message_text, message_type, sent_at")
    .eq("chat_import_id", importId)
    .eq("message_type", "text")
    .order("sequence_no", { ascending: true })
    .limit(5000);
  if (messageError) throw messageError;

  const forwarded = (rows ?? []).every((r) => r.speaker_display_name === FORWARDED_SPEAKER);
  const lines: ChatLine[] = (rows ?? []).map((r) => {
    const contact = r.contact_id ? contacts.get(r.contact_id as string) : undefined;
    return {
      date: forwarded || !r.sent_at ? null : taipeiDate(r.sent_at as string),
      speaker: forwarded ? null : (contact?.name ?? "我"),
      text: (r.message_text as string | null) ?? "",
    };
  });
  const { transcript, firstDate, lastDate } = buildTranscript(lines);
  if (!transcript) return { ok: false, error: "這段對話沒有文字內容", contacts: contactList };

  const isGroup = chatImport.chat_type === "group";
  const result = await aiComplete(
    milestonePrompt({ transcript, contactNames: contactList.map((c) => c.name), isGroup, year: (lastDate ?? ctx.today).slice(0, 4), datesKnown: !forwarded }),
    {
      maxTokens: 900,
      temperature: 0.2,
      timeoutMs: 30_000,
      deadline: opts.deadline,
      allowSimplified: true, // filtered point by point below instead of rejecting the whole reply
      system: "你是整理對話重點的助理，只輸出使用者指定格式的 JSON。",
      validate: (text) => (extractJsonObject(text) ? null : "沒有回傳 JSON"),
    },
  );
  if (!result.ok) return { ok: false, error: result.error, contacts: contactList };

  const parsed = parseMilestoneReply(extractJsonObject(result.text), {
    fallbackDate: ctx.today,
    minDate: firstDate,
    maxDate: lastDate,
    isSimplified: hasSimplifiedChinese,
  });
  if (parsed.milestones.length === 0 && parsed.promises.length === 0) {
    return { ok: false, error: "AI 沒有找到值得記的重點", contacts: contactList };
  }

  // In a 1-on-1 chat everything belongs to that one person; in a group, to
  // whoever said it (your own lines and unknown speakers go to the first contact).
  const primary = (chatImport.primary_contact_id && contacts.get(chatImport.primary_contact_id as string)) || contactList[0];
  const owner = (who: string) => (isGroup ? (bySpeaker.get(who) ?? primary) : primary);
  const milestones = parsed.milestones.map((m) => ({ ...m, contactId: owner(m.who).id }));

  const { error: deleteError } = await ctx.supabase
    .from("contact_interactions")
    .delete()
    .eq("owner_id", ctx.ownerId)
    .eq("chat_import_id", importId);
  if (deleteError) throw deleteError;
  if (milestones.length > 0) {
    const { error: insertError } = await ctx.supabase.from("contact_interactions").insert(
      milestones.map((m) => ({
        owner_id: ctx.ownerId,
        contact_id: m.contactId,
        occurred_on: m.date,
        content: m.point,
        kind: "chat",
        chat_import_id: importId,
      })),
    );
    if (insertError) throw insertError;
  }

  const promises = parsed.promises.map((p) => ({ ...p, contactId: primary.id }));
  for (const promise of promises) {
    const title = `答應 ${primary.name}：${promise.text}`.slice(0, 200);
    const { count } = await ctx.supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ctx.ownerId)
      .eq("contact_id", primary.id)
      .eq("title", title);
    if (!count) await createTask(ctx, { title, due_date: promise.due ?? undefined, contact_id: primary.id, source_type: "chat_extraction" });
  }

  return { ok: true, milestones, promises, contacts: contactList };
}

/** YYYY-MM-DD in Taiwan time for a stored timestamp. */
function taipeiDate(iso: string) {
  return new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reply card
// ---------------------------------------------------------------------------

const short = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

/** "🧭 溝通節點" card: the moments worth remembering, in date order, plus what you promised. */
export function milestoneBubble(result: Extract<AnalyzeResult, { ok: true }>, importId: string, isGroup: boolean) {
  const contact = result.contacts.find((c) => c.id === result.milestones[0]?.contactId) ?? result.contacts[0];
  const body: Record<string, unknown>[] = result.milestones.map((m) => ({
    type: "box",
    layout: "horizontal",
    spacing: "md",
    contents: [
      { type: "text", text: short(m.date), size: "xs", color: THEME.muted, flex: 0, gravity: "top" },
      {
        type: "text",
        text: isGroup && m.who && m.who !== "我" ? `${m.who}：${m.point}` : m.point,
        size: "sm",
        wrap: true,
        flex: 1,
      },
    ],
  }));
  if (result.promises.length > 0) {
    body.push({ type: "separator", margin: "md" });
    body.push({ type: "text", text: "📌 你答應的事（已加進待辦）", size: "xs", color: THEME.muted, margin: "md" });
    for (const p of result.promises) {
      body.push({ type: "text", text: `・${p.text}${p.due ? `（${short(p.due)}）` : ""}`, size: "sm", wrap: true });
    }
  }
  const timeline = isLinkSigningConfigured() ? uri("📇 完整時間軸", contactFormUrl(contact.id)) : null;
  return cardBubble({
    title: `🧭 溝通節點 · ${isGroup ? `${result.contacts.length} 人群組` : contact.name}`,
    subtitle: "AI 整理，下次聊天從這裡接",
    body,
    buttons: [
      isGroup ? null : { action: postback("💬 接著聊", { a: "msg", id: contact.id, k: "hello" }), style: "primary" },
      timeline ? { action: timeline, style: "secondary" } : null,
      { action: postback("🔄 重新整理", { a: "nodes", i: importId }, "重新整理溝通節點"), style: "secondary" },
    ],
  });
}

/** Runs the analysis and turns the outcome into something to reply with — never throws for AI trouble. */
export async function milestoneMessages(ctx: BotCtx, importId: string, opts: { deadline?: number } = {}) {
  // The "…" typing indicator while the free model reads the chat.
  if (isAiConfigured()) await showLoading(ctx.lineUserId, 60);
  let result: AnalyzeResult;
  try {
    result = await analyzeChatImport(ctx, importId, opts);
  } catch (error) {
    console.error("[line-bot] milestone analysis failed", error);
    result = { ok: false, error: "整理時出了點問題", contacts: [] };
  }
  if (result.ok) {
    const { data } = await ctx.supabase.from("chat_imports").select("chat_type").eq("id", importId).maybeSingle();
    return { ok: true as const, bubble: milestoneBubble(result, importId, data?.chat_type === "group") };
  }
  return {
    ok: false as const,
    note: `🧭 溝通節點這次沒整理出來（${result.error.slice(0, 80)}）。免費 AI 偶爾會忙，等一下按「🧭 整理溝通節點」再試。`,
    retry: postback("🧭 整理溝通節點", { a: "nodes", i: importId }, "整理溝通節點"),
  };
}
