"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getLiff } from "@/lib/mini/liff-client";

import { confirmSend } from "../actions";
import { MiniDone } from "../mini-done";

type Channel = "line" | "whatsapp" | "wechat";

interface Props {
  token: string;
  contactId: string;
  contactName: string;
  channel: Channel;
  messageText: string;
  channelLabel: string;
  occasionLabel: string;
  waUrl: string | null;
  lineUrl: string;
  reminderId?: string;
}

/**
 * On LINE, tries `liff.shareTargetPicker()` first — LINE's own share sheet,
 * which (unlike the plain line.me/R/share link) tells the caller whether the
 * user actually sent it. A real "sent" signal auto-confirms, no tap needed.
 * Everything else (WhatsApp, WeChat, or LINE without that permission) shows
 * the message with a "✅ 我傳了" button right here, right after the action —
 * not a quick-reply you have to go hunting for later.
 */
export function SendFlow(props: Props) {
  const { token, contactId, channel, messageText, channelLabel, occasionLabel, waUrl, lineUrl, reminderId } = props;
  const [phase, setPhase] = useState<"checking" | "ready" | "confirming" | "done" | "auto-done">(
    channel === "line" ? "checking" : "ready",
  );
  const [note, setNote] = useState("");

  async function confirm() {
    setPhase("confirming");
    const result = await confirmSend(token, contactId, { reminderId, channelLabel, occasionLabel });
    if (!result.ok) {
      setNote(result.error ?? "記錄失敗，請稍後再試");
      setPhase("ready");
      return;
    }
    setPhase("done");
  }

  useEffect(() => {
    if (channel !== "line") return;
    let cancelled = false;
    (async () => {
      const liff = await getLiff();
      if (!liff || !liff.isApiAvailable?.("shareTargetPicker")) {
        if (!cancelled) setPhase("ready");
        return;
      }
      try {
        const result = await liff.shareTargetPicker([{ type: "text", text: messageText }], { isMultiple: true });
        if (cancelled) return;
        if (result?.status === "success") {
          await confirmSend(token, contactId, { reminderId, channelLabel, occasionLabel });
          setPhase("auto-done");
        } else {
          // Cancelled — let them try again or fall back to the plain share link.
          setPhase("ready");
        }
      } catch {
        if (!cancelled) setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once on mount; re-running on every prop identity change would re-open the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "checking") return <p className="p-6 text-center text-sm text-muted-foreground">準備傳送…</p>;
  if (phase === "auto-done") return <MiniDone message={`✅ 已送出給 ${props.contactName}，幫你記下來了`} />;
  if (phase === "done") return <MiniDone message="✅ 已記錄，下次找他會提醒你聊過這件事" />;

  return (
    <div className="space-y-4 p-4">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">
          {occasionLabel} · {props.contactName}
        </h1>
        <p className="text-xs text-muted-foreground">
          {channel === "line"
            ? "LINE 的傳送確認視窗沒開啟，改用下面的連結傳送後，記得按「我傳了」"
            : `用 ${channelLabel} 傳給他，傳完回來按「我傳了」就會幫你記下來`}
        </p>
      </header>

      <div className="rounded-xl border bg-muted/30 p-4 text-sm whitespace-pre-wrap">{messageText}</div>

      {note ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{note}</p> : null}

      <div className="space-y-2">
        {channel === "line" ? (
          <Button render={<a href={lineUrl} />} className="h-12 w-full text-base">
            開啟 LINE 傳送
          </Button>
        ) : channel === "whatsapp" && waUrl ? (
          <Button render={<a href={waUrl} />} className="h-12 w-full text-base">
            開啟 WhatsApp
          </Button>
        ) : channel === "wechat" ? (
          <p className="text-center text-xs text-muted-foreground">長按上面的文字即可複製，貼到 WeChat 傳給他</p>
        ) : null}

        <Button variant="outline" className="h-12 w-full text-base" onClick={confirm} disabled={phase === "confirming"}>
          {phase === "confirming" ? "記錄中…" : "✅ 我傳了"}
        </Button>
      </div>
    </div>
  );
}
