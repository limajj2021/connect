import "server-only";

import { appBaseUrl } from "@/lib/line/links";

import { signScope } from "./token";

/**
 * URL of a mini-form. With a LIFF app configured it opens as a sheet over the
 * LINE chat (liff.line.me/<id>/<path> → <endpoint>/<path>); otherwise it opens
 * the same page in LINE's in-app browser.
 */
export function miniUrl(path: string, scope: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...params, t: signScope(scope) }).toString();
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  return liffId ? `https://liff.line.me/${liffId}${path}?${query}` : `${appBaseUrl()}/m${path}?${query}`;
}

export const contactFormUrl = (contactId: string) => miniUrl(`/contacts/${contactId}`, `contact:${contactId}`);
export const newContactFormUrl = (prefillName?: string) =>
  miniUrl("/contacts/new", "contact:new", prefillName ? { name: prefillName } : {});
export const newTaskFormUrl = (contactId?: string) => miniUrl("/tasks/new", "task:new", contactId ? { contact: contactId } : {});
export const batchFormUrl = () => miniUrl("/batch", "batch");

/** The LIFF contact list (needs the LIFF app; it authenticates by LINE login). */
export function contactListUrl(): string | null {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  return liffId ? `https://liff.line.me/${liffId}/contacts` : null;
}

/**
 * Opens the one-screen "send" flow (/m/send): tries LIFF's shareTargetPicker
 * for a real "it was actually sent" signal on LINE, falls back to a manual
 * confirm button for WhatsApp/WeChat — see src/app/m/send. `kind`/`occasion`
 * mirror the bot's own greeting generation so the message text is computed
 * once, not duplicated into the URL.
 */
export function sendMessageUrl(opts: {
  contactId: string;
  channel: "line" | "whatsapp" | "wechat";
  kind: "birthday" | "festival" | "hello";
  occasionName?: string;
  variant?: number;
  reminderId?: string;
}): string {
  return miniUrl(`/send`, `send:${opts.contactId}`, {
    contact: opts.contactId,
    ch: opts.channel,
    k: opts.kind,
    ...(opts.occasionName ? { o: opts.occasionName } : {}),
    v: String(opts.variant ?? 0),
    ...(opts.reminderId ? { r: opts.reminderId } : {}),
  });
}
