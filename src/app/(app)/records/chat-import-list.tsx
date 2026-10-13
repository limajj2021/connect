import Link from "next/link";
import { Calendar, MessageSquareText, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ChatImportWithContact } from "@/lib/chat-import/queries";
import { formatTaipeiDate } from "@/lib/format-date";

const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
  failed: "失敗",
};

export function ChatImportList({ imports }: { imports: ChatImportWithContact[] }) {
  return (
    <ul className="divide-y">
      {imports.map((item) => (
        <li key={item.id}>
          <Link
            href={`/records/chats/${item.id}`}
            className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/50 md:px-6"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{item.source_chat_name ?? item.file_name}</span>
              <Badge variant={item.parse_status === "failed" ? "destructive" : "outline"}>
                {STATUS_LABELS[item.parse_status]}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                {formatTaipeiDate(item.imported_at)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquareText className="size-3.5" />
                {item.message_count} 則訊息
              </span>
              {item.chat_type === "group" ? (
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" />
                  群組聊天
                </span>
              ) : item.primary_contact ? (
                <span>{item.primary_contact.name}</span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
