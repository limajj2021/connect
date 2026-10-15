import "server-only";

import { aiComplete, isAiConfigured } from "@/lib/ai/openrouter";
import type { LineMessage } from "@/lib/line/api";
import { type ContactForCard, MAIN_QUICK, carousel, postback, text } from "@/lib/line/flex";

import { card } from "./cards";
import {
  type BotCtx,
  CONTACT_CARD_COLUMNS,
  contactsMentionedIn,
  createInteraction,
  findContactByExactName,
  getContact,
  recentContacts,
  saveSession,
  searchContacts,
  updateContact,
} from "./data";
import { formatShortDate } from "./dates";
import { normalizeText } from "./extract";
import { PLATFORM_LABEL, type SocialLink, type SocialPlatform, linkedinHandle, readOpenGraph, textWithoutUrls } from "./social";

/** Waiting for "whose profile / post is this?". */
export type SocialState = {
  flow: "social";
  kind: "profile" | "post";
  platform?: SocialPlatform;
  url?: string;
  handle?: string;
  content?: string;
};
/** After 動態: waiting for a post link or screenshot. */
export type PostWaitState = { flow: "post_wait"; contactId?: string };
/** A post was saved without a summary — the next line you type becomes it. */
export type PostNoteState = { flow: "post_note"; interactionId: string; contactName: string };

const CANCEL = postback("✖ 不用存", { a: "stop" }, "不用存");
const PROFILE_FIELD: Record<SocialPlatform, "linkedin_url" | "facebook_url"> = { linkedin: "linkedin_url", facebook: "facebook_url" };

// ---------------------------------------------------------------------------
// Post content: what a post said, in one line
// ---------------------------------------------------------------------------

/** og:description of a public post page, when the platform serves one without login (LinkedIn often does). */
async function fetchPostText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; PersonalCRM/1.0; +link-preview)", accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 300_000);
    const og = readOpenGraph(html);
    const value = [og.title, og.description].filter(Boolean).join("\n");
    // Login walls come back as a generic page ("Log in or sign up to view").
    if (!value || /log ?in|sign ?up|登入|註冊/i.test(value.slice(0, 60))) return null;
    return value.slice(0, 2_000);
  } catch {
    return null;
  }
}

/** One line ("升任 XX 副總，分享了印度市場的觀察") from a post's text, by AI when available. */
export async function summarizePost(raw: string, deadline = Date.now() + 25_000): Promise<string> {
  const plain = raw.replace(/\s+/g, " ").trim();
  if (!isAiConfigured() || plain.length <= 40) return plain.slice(0, 120);
  const result = await aiComplete(
    `以下是一位朋友在社群上發的貼文內容（可能是截圖辨識出來的文字，含雜訊）。用一句話（30 字以內）寫出他分享了什麼，讓我下次跟他聊天時可以自然提起。只輸出那一句。\n\n${plain.slice(0, 3_000)}`,
    { maxTokens: 120, temperature: 0.3, deadline, validate: (t) => (t.length <= 100 ? null : "太長") },
  );
  return result.ok ? result.text.replace(/^["「『]|["」』]$/g, "") : plain.slice(0, 120);
}

// ---------------------------------------------------------------------------
// Finding whose it is
// ---------------------------------------------------------------------------

async function contactsByLinkedinHandle(ctx: BotCtx, handle: string): Promise<ContactForCard[]> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .ilike("linkedin_url", `%/in/${handle.replace(/[%_\\]/g, "")}%`)
    .limit(3);
  if (error) throw error;
  return ((data ?? []) as ContactForCard[]).filter((c) => linkedinHandle(c.linkedin_url) === handle);
}

async function contactWithProfile(ctx: BotCtx, platform: SocialPlatform, url: string): Promise<ContactForCard | null> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .eq(PROFILE_FIELD[platform], url)
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as ContactForCard[])[0] ?? null;
}

async function askWhose(ctx: BotCtx, state: SocialState, hintText: string): Promise<LineMessage[]> {
  await saveSession(ctx, state);
  const mentioned = hintText ? await contactsMentionedIn(ctx, hintText) : [];
  const { contacts: recent } = await recentContacts(ctx, 6);
  const options = [...new Map([...mentioned, ...recent].map((c) => [c.id, c])).values()].slice(0, 8);
  const what = state.kind === "profile" ? `${PLATFORM_LABEL[state.platform!]} 個人頁` : "動態";
  const preview = state.content ? `\n「${state.content.slice(0, 60)}」` : "";
  return [
    text(`📣 這是誰的${what}？${preview}\n點下面的人，或直接打名字：`, [
      ...options.map((c) => postback(`👤 ${c.name}`, { a: "soc_to", id: c.id }, `是 ${c.name}`)),
      CANCEL,
    ]),
  ];
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** A LinkedIn / Facebook link was pasted or shared into the chat. */
export async function receiveSocialLink(ctx: BotCtx, link: SocialLink, input: string): Promise<LineMessage[]> {
  const typed = textWithoutUrls(input);
  if (link.kind === "profile") {
    const owner = await contactWithProfile(ctx, link.platform, link.url);
    if (owner) return [text(`這是 ${owner.name} 的 ${PLATFORM_LABEL[link.platform]}，已經存過了 👍`), carousel(owner.name, [await card(ctx, owner)])];
    const state: SocialState = { flow: "social", kind: "profile", platform: link.platform, url: link.url, handle: link.handle };
    const mentioned = typed ? await contactsMentionedIn(ctx, typed) : [];
    if (mentioned.length === 1) return assignSocial(ctx, state, mentioned[0].id);
    return askWhose(ctx, state, typed);
  }

  // A post: what it says (what you typed with it, else the page's own preview).
  const pageText = typed ? null : await fetchPostText(link.url);
  const content = typed || (pageText ? await summarizePost(pageText) : undefined);
  const state: SocialState = { flow: "social", kind: "post", platform: link.platform, url: link.url, handle: link.handle, content };
  const byHandle = link.handle ? await contactsByLinkedinHandle(ctx, link.handle) : [];
  if (byHandle.length === 1) return assignSocial(ctx, state, byHandle[0].id);
  const mentioned = await contactsMentionedIn(ctx, [typed, pageText].filter(Boolean).join("\n"));
  if (mentioned.length === 1) return assignSocial(ctx, state, mentioned[0].id);
  return askWhose(ctx, state, [typed, pageText].filter(Boolean).join("\n"));
}

/** 動態 [名字] — waits for a post link or screenshot. */
export async function startPost(ctx: BotCtx, name?: string): Promise<LineMessage[]> {
  const contact = name ? ((await findContactByExactName(ctx, name))[0] ?? (await searchContacts(ctx, name, 1))[0]) : undefined;
  await saveSession(ctx, { flow: "post_wait", contactId: contact?.id } satisfies PostWaitState);
  return [
    text(
      [
        `📣 記${contact ? ` ${contact.name} 的` : "一則"}動態`,
        "把 LinkedIn／Facebook 貼文的「分享 → 複製連結」貼給我，或直接傳貼文截圖。",
        "也可以直接打一句，例如：升任副總、剛去日本出差。",
      ].join("\n"),
      [CANCEL],
    ),
  ];
}

/** Whatever arrives while waiting after 動態: a link, a screenshot's text, or a typed line. */
export async function receivePost(ctx: BotCtx, state: PostWaitState, input: { link?: SocialLink; text: string; fromImage?: boolean }) {
  const raw = input.fromImage ? input.text : textWithoutUrls(input.text);
  const content = input.link && !raw ? undefined : input.fromImage ? await summarizePost(raw) : raw;
  const social: SocialState = {
    flow: "social",
    kind: "post",
    platform: input.link?.platform ?? (input.fromImage ? detectPlatform(raw) : undefined),
    url: input.link?.url,
    handle: input.link?.handle,
    content,
  };
  if (input.link && !content) {
    const pageText = await fetchPostText(input.link.url);
    if (pageText) social.content = await summarizePost(pageText);
  }
  if (state.contactId) return assignSocial(ctx, social, state.contactId);
  // A post screenshot shows the author's name right at the top.
  const mentioned = await contactsMentionedIn(ctx, input.text);
  if (mentioned.length === 1) return assignSocial(ctx, social, mentioned[0].id);
  return askWhose(ctx, social, input.text);
}

function detectPlatform(ocrText: string): SocialPlatform | undefined {
  if (/linkedin|領英|追蹤者|followers|connections|人脈/i.test(ocrText)) return "linkedin";
  if (/facebook|讚|留言|分享|like|comment/i.test(ocrText)) return "facebook";
  return undefined;
}

/** "王小明" typed while asked whose it is. */
export async function answerWhose(ctx: BotCtx, state: SocialState, name: string): Promise<LineMessage[]> {
  const term = normalizeText(name).trim();
  const exact = await findContactByExactName(ctx, term);
  const matches = exact.length > 0 ? exact : await searchContacts(ctx, term, 5);
  if (matches.length === 1) return assignSocial(ctx, state, matches[0].id);
  if (matches.length === 0) return [text(`找不到「${term}」，再打一次名字，或先新增這位人脈。`, [CANCEL])];
  return [text(`有 ${matches.length} 位符合，是哪一位？`, [...matches.map((c) => postback(`👤 ${c.name}`, { a: "soc_to", id: c.id }, `是 ${c.name}`)), CANCEL])];
}

/** Saves the profile link / post on that contact. */
export async function assignSocial(ctx: BotCtx, state: SocialState, contactId: string): Promise<LineMessage[]> {
  const contact = await getContact(ctx, contactId);
  if (!contact) return [text("找不到這位人脈。", MAIN_QUICK)];
  await saveSession(ctx, null);

  if (state.kind === "profile" && state.platform && state.url) {
    const updated = await updateContact(ctx, contact.id, { [PROFILE_FIELD[state.platform]]: state.url });
    return [
      text(`🔗 已把 ${PLATFORM_LABEL[state.platform]} 存到 ${updated.name}，卡片上一鍵就能打開看他的動態。`),
      carousel(updated.name, [await card(ctx, updated)], MAIN_QUICK),
    ];
  }

  // A LinkedIn post link names its author's profile — fill it in if missing.
  let current = contact;
  if (state.platform === "linkedin" && state.handle && !contact.linkedin_url) {
    current = await updateContact(ctx, contact.id, { linkedin_url: `https://www.linkedin.com/in/${state.handle}` });
  }
  const content = state.content?.trim() || `在 ${state.platform ? PLATFORM_LABEL[state.platform] : "社群"} 發了一則動態`;
  const { data, error } = await ctx.supabase
    .from("contact_interactions")
    .insert({ owner_id: ctx.ownerId, contact_id: current.id, occurred_on: ctx.today, content: content.slice(0, 1000), kind: "post", source_url: state.url ?? null })
    .select("id")
    .single();
  if (error) throw error;

  if (!state.content?.trim()) {
    await saveSession(ctx, { flow: "post_note", interactionId: data.id as string, contactName: current.name } satisfies PostNoteState);
    return [
      text(`📣 已存到 ${current.name} 的動態（${formatShortDate(ctx.today)}）。\n我讀不到貼文內容，想補一句重點就直接打，例如：升任副總、剛去日本出差。`, [
        postback("不用補", { a: "stop" }, "不用補"),
      ]),
    ];
  }
  return [
    text(`📣 已存到 ${current.name} 的動態：「${content.slice(0, 80)}」\n下次傳訊息時卡片上會提醒你，可以順口聊到。`),
    carousel(current.name, [await card(ctx, current)], MAIN_QUICK),
  ];
}

/** The one-line summary typed after a post was saved without one. */
export async function addPostNote(ctx: BotCtx, state: PostNoteState, note: string): Promise<LineMessage[]> {
  const content = normalizeText(note).trim().slice(0, 1000);
  const { error } = await ctx.supabase
    .from("contact_interactions")
    .update({ content })
    .eq("owner_id", ctx.ownerId)
    .eq("id", state.interactionId);
  if (error) throw error;
  await saveSession(ctx, null);
  return [text(`📣 ${state.contactName} 的動態：「${content.slice(0, 80)}」✅`, MAIN_QUICK)];
}

/** `動態 王小明 升任副總` in one line. */
export async function logPost(ctx: BotCtx, name: string, content: string): Promise<LineMessage[]> {
  const contact = (await findContactByExactName(ctx, name))[0] ?? (await searchContacts(ctx, name, 1))[0];
  if (!contact) return [text(`找不到「${name}」。`, MAIN_QUICK)];
  await createInteraction(ctx, contact.id, content, ctx.today, { kind: "post" });
  return [text(`📣 已存到 ${contact.name} 的動態：「${content.slice(0, 80)}」`, MAIN_QUICK)];
}
