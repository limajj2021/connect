"use client";

import { MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function LineContactButton({
  displayName,
  lineUrl,
}: {
  displayName: string | null;
  lineUrl: string | null;
}) {
  async function handleContact() {
    if (!displayName) {
      toast.error("尚未設定 LINE 顯示名稱");
      return;
    }

    try {
      await navigator.clipboard.writeText(displayName);
      toast.success(`已複製「${displayName}」，可貼到 LINE 搜尋欄`);
    } catch {
      toast.error("複製失敗，請手動複製名稱");
    }

    // Best-effort app launch — there is no guarantee this lands on the
    // search tab or the right chat; the copied name is the real fallback.
    window.location.href = "line://";
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="secondary" onClick={handleContact} disabled={!displayName}>
        <MessageCircle className="size-4" />
        聯絡 LINE
      </Button>
      {lineUrl ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          render={<a href={lineUrl} target="_blank" rel="noopener noreferrer" aria-label="開啟 LINE 連結" />}
        >
          <ExternalLink className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
