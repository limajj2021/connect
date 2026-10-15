import "server-only";

import { type ContactForCard, type ContactLinks, contactBubble, contactCards } from "@/lib/line/flex";
import { contactFormUrl, newTaskFormUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";

/** Signed links to the one-screen edit / task forms for a contact card. */
export function linksFor(contact: Pick<ContactForCard, "id">): ContactLinks | undefined {
  if (!isLinkSigningConfigured()) return undefined;
  return { edit: contactFormUrl(contact.id), task: newTaskFormUrl(contact.id) };
}

export const card = (contact: ContactForCard) => contactBubble(contact, linksFor(contact));
export const cards = (contacts: ContactForCard[], intro?: string) => contactCards(contacts, intro, linksFor);
