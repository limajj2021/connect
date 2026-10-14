/**
 * Deep links used on the bot's "send a message" buttons. LINE has no URL that
 * opens a chat with a specific *personal* friend, so the LINE button opens the
 * share picker with the text prefilled (pick one friend, or several to send
 * the same text to everyone). WhatsApp can open the exact chat by phone.
 */

export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}

/** Opens a personal LINE profile by its (searchable) LINE ID. */
export function lineProfileUrl(lineId: string): string {
  const id = lineId.trim();
  return id.startsWith("@")
    ? `https://line.me/R/ti/p/${encodeURIComponent(id)}`
    : `https://line.me/R/ti/p/~${encodeURIComponent(id)}`;
}

/** wa.me needs the international number without "+", spaces or a leading 0. */
export function toWhatsappNumber(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("886")) return digits;
  if (/^09\d{8}$/.test(digits)) return `886${digits.slice(1)}`;
  if (/^00\d+/.test(digits)) return digits.slice(2);
  return digits.length >= 10 ? digits : null;
}

export function whatsappUrl(phone: string, text: string): string | null {
  const number = toWhatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/** Web back office link; LINE opens it in the phone's real browser. */
export function webUrl(path: string): string {
  const url = new URL(path, appBaseUrl());
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}
