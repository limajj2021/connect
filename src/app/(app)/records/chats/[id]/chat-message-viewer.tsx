import type { ChatMessageRow } from "@/types/database";
import { cn } from "@/lib/utils";

const TYPE_PLACEHOLDER_HINT: Partial<Record<string, string>> = {
  sticker: "貼圖",
  image: "照片",
  video: "影片",
  audio: "語音訊息",
  file: "檔案",
  call: "通話",
};

function formatTime(sentAt: string | null) {
  if (!sentAt) return "";
  return new Date(sentAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(sentAt: string | null) {
  if (!sentAt) return "";
  return new Date(sentAt).toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function ChatMessageViewer({ messages }: { messages: ChatMessageRow[] }) {
  const items = messages.map((message, index) => ({
    message,
    date: formatDate(message.sent_at),
    showDateDivider: index === 0 || formatDate(message.sent_at) !== formatDate(messages[index - 1].sent_at),
  }));

  return (
    <div className="space-y-1">
      {items.map(({ message, date, showDateDivider }) => {
        const isOwner = message.speaker_display_name === "我";
        const isSystem = !message.speaker_display_name;

        return (
          <div
            key={message.id}
            id={`msg-${message.id}`}
            className="scroll-mt-20 [&:target]:rounded-lg [&:target]:bg-amber-100 dark:[&:target]:bg-amber-900/40"
          >
            {showDateDivider ? (
              <div className="sticky top-0 z-10 my-3 flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{date}</span>
              </div>
            ) : null}

            {isSystem ? (
              <p className="py-1 text-center text-xs text-muted-foreground">{message.message_text}</p>
            ) : (
              <div className={cn("flex", isOwner ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] space-y-0.5", isOwner ? "items-end text-right" : "items-start")}>
                  {!isOwner ? (
                    <p className="text-xs text-muted-foreground">{message.speaker_display_name}</p>
                  ) : null}
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                      isOwner ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {message.message_type !== "text" && TYPE_PLACEHOLDER_HINT[message.message_type]
                      ? message.message_text || `[${TYPE_PLACEHOLDER_HINT[message.message_type]}]`
                      : message.message_text}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{formatTime(message.sent_at)}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
