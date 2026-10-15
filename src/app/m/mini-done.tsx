"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { backToChatUrl, closeMiniApp } from "@/lib/mini/liff-client";

/** Success screen: closes the LIFF sheet automatically when inside LINE. */
export function MiniDone({ message, returnTo }: { message: string; returnTo?: string }) {
  const [closing, setClosing] = useState(true);

  useEffect(() => {
    // Opened from the contact list: go back to it; otherwise close the sheet.
    if (returnTo) {
      const timer = setTimeout(() => window.location.replace(returnTo), 700);
      return () => clearTimeout(timer);
    }
    void closeMiniApp().then((closed) => {
      if (!closed) setClosing(false);
    });
  }, [returnTo]);

  const back = backToChatUrl();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="size-12 text-emerald-500" />
      <p className="text-lg font-semibold">{message}</p>
      {closing ? null : (
        <>
          <p className="text-sm text-muted-foreground">可以關閉這個頁面回到 LINE 了。</p>
          {back ? (
            <Button render={<a href={back} />} variant="outline">
              回到 LINE
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
