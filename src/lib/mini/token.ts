import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, scoped links for the mobile mini-forms the LINE bot opens
 * (/m/...). Possession of the link is the credential — like a magic link —
 * so each token is bound to one scope ("contact:<id>", "contact:new",
 * "task:new") and expires. Only ever sent inside the owner's own LINE chat.
 */

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret(): string {
  const value = process.env.LINK_SIGNING_SECRET;
  if (!value || value.length < 32) throw new Error("LINK_SIGNING_SECRET is not set (min 32 chars)");
  return value;
}

export function isLinkSigningConfigured() {
  return (process.env.LINK_SIGNING_SECRET?.length ?? 0) >= 32;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function signScope(scope: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const payload = b64url(Buffer.from(JSON.stringify({ s: scope, e: Math.floor(Date.now() / 1000) + ttlSeconds })));
  const mac = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${mac}`;
}

export function verifyScope(token: string | null | undefined, scope: string): boolean {
  if (!token || !isLinkSigningConfigured()) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return false;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const { s, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s: string; e: number };
    return s === scope && typeof e === "number" && e * 1000 > Date.now();
  } catch {
    return false;
  }
}
