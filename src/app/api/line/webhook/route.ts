import { NextResponse, after } from "next/server";

import { type LineEvent, processLineEvents } from "@/lib/bot/events";
import { lineConfig } from "@/lib/line/config";
import { verifyLineSignature } from "@/lib/line/signature";

// OCR and chat imports can take a while; the 200 goes back to LINE right away
// and the work continues in after().
export const maxDuration = 60;

export async function POST(request: Request) {
  const { channelSecret } = lineConfig();
  if (!channelSecret) {
    return new NextResponse("LINE bot not configured", { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), channelSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(rawBody) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  after(async () => {
    try {
      await processLineEvents(events);
    } catch (error) {
      console.error("[line-bot] events failed", error);
    }
  });

  return NextResponse.json({ ok: true });
}
