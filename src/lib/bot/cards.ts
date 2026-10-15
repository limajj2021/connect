import "server-only";

import { type ContactForCard, type ContactLinks, contactBubble, contactCards } from "@/lib/line/flex";
import { contactFormUrl, newTaskFormUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";

import { type BotCtx, lastTouchesFor } from "./data";

/** Signed links to the one-screen edit / task forms for a contact card. */
export function linksFor(contact: Pick<ContactForCard, "id">): ContactLinks | undefined {
  if (!isLinkSigningConfigured()) return undefined;
  return { edit: contactFormUrl(contact.id), task: newTaskFormUrl(contact.id) };
}

/** Contact card with "上次聊到" / "他的動態" when there are logged ones. */
export async function card(ctx: BotCtx, contact: ContactForCard) {
  const [touch, post] = await Promise.all([lastTouchesFor(ctx, [contact.id], "chat"), lastTouchesFor(ctx, [contact.id], "post")]);
  return contactBubble(contact, linksFor(contact), touch.get(contact.id), post.get(contact.id));
}

export async function cards(ctx: BotCtx, contacts: ContactForCard[], intro?: string) {
  const ids = contacts.map((c) => c.id);
  const [touches, posts] = await Promise.all([lastTouchesFor(ctx, ids, "chat"), lastTouchesFor(ctx, ids, "post")]);
  return contactCards(contacts, intro, linksFor, touches, posts);
}
