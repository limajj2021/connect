"use client";

import type { Liff } from "@line/liff";

let liffPromise: Promise<Liff | null> | null = null;

/** Loads + initialises the LIFF SDK once, only when a LIFF app is configured. */
export function getLiff(): Promise<Liff | null> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId || typeof window === "undefined") return Promise.resolve(null);
  liffPromise ??= import("@line/liff")
    .then(async ({ default: liff }) => {
      await liff.init({ liffId });
      return liff;
    })
    .catch(() => null);
  return liffPromise;
}

/** Closes the LIFF sheet when running inside LINE; returns false elsewhere. */
export async function closeMiniApp(): Promise<boolean> {
  const liff = await getLiff();
  if (liff?.isInClient()) {
    liff.closeWindow();
    return true;
  }
  return false;
}

export function backToChatUrl(): string | null {
  const basicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID;
  return basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null;
}
