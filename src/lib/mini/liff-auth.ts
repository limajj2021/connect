import "server-only";

import { lineConfig } from "@/lib/line/config";

/**
 * Pages opened straight from the rich menu (no signed link) prove who is
 * looking with the LIFF ID token: LINE verifies it for our Login channel and
 * it must belong to the bot's owner. Verified tokens are cached until expiry.
 */
const verified = new Map<string, number>();

export async function isOwnerIdToken(idToken: string | null): Promise<boolean> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const owner = process.env.LINE_OWNER_USER_ID;
  if (!idToken || !channelId || !owner) return false;

  const cachedUntil = verified.get(idToken);
  if (cachedUntil && cachedUntil > Date.now()) return true;

  const res = await fetch(`${lineConfig().apiBase}/oauth2/v2.1/verify`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return false;
  const claims = (await res.json()) as { sub?: string; exp?: number };
  if (claims.sub !== owner) return false;
  verified.set(idToken, (claims.exp ?? 0) * 1000);
  if (verified.size > 100) verified.delete(verified.keys().next().value!);
  return true;
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
