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
