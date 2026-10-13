"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveExtraction, rejectExtraction, saveExtractionEdits } from "@/lib/ai-extraction/actions";
import type { ChatExtractionRow } from "@/types/database";

const CATEGORY_LABELS: Record<string, string> = {
  person: "人物",
  company: "公司",
  topic: "討論議題",
  fact: "重要資訊",
  date_event: "日期／行程",
  todo: "待辦事項",
};

interface Payload {
  title: string;
  description?: string;
  relatedContactName?: string | null;
  dueDate?: string | null;
  eventDate?: string | null;
  assignee?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
}

function getPayload(extraction: ChatExtractionRow): Payload {
  return extraction.payload as unknown as Payload;
}

function ExtractionCard({ extraction, chatImportId }: { extraction: ChatExtractionRow; chatImportId: string }) {
  const payload = getPayload(extraction);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(payload.title);
  const [description, setDescription] = useState(payload.description ?? "");
  const [relatedContactName, setRelatedContactName] = useState(payload.relatedContactName ?? "");
  const [isPending, startTransition] = useTransition();

  const firstSourceId = extraction.source_message_ids[0];
  const isResolved = extraction.review_status !== "pending";

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveExtraction(extraction.id);
        toast.success("已核准並寫入人脈資料");
      } catch {
        toast.error("操作失敗，請稍後再試");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectExtraction(extraction.id);
        toast.success("已略過此筆擷取結果");
      } catch {
        toast.error("操作失敗，請稍後再試");
      }
    });
  }

  function handleSaveEdit() {
    startTransition(async () => {
      try {
        await saveExtractionEdits(extraction.id, {
          title,
          description: description || undefined,
          relatedContactName: relatedContactName || null,
        });
        toast.success("已儲存修改並寫入人脈資料");
        setEditing(false);
      } catch {
        toast.error("操作失敗，請稍後再試");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{CATEGORY_LABELS[extraction.extraction_type]}</Badge>
        <Badge variant={extraction.confidence === "confirmed" ? "secondary" : "outline"}>
          {extraction.confidence === "confirmed" ? "可信" : "待確認"}
        </Badge>
        {extraction.review_status !== "pending" ? (
          <Badge variant={extraction.review_status === "rejected" ? "destructive" : "default"}>
            {extraction.review_status === "accepted" ? "已核准" : extraction.review_status === "edited" ? "已編輯核准" : "已拒絕"}
          </Badge>
        ) : null}
        {firstSourceId ? (
          <a
            href={`/records/chats/${chatImportId}#msg-${firstSourceId}`}
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2"
          >
            查看原文
          </a>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="標題" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="說明" rows={2} />
          <Input
            value={relatedContactName}
            onChange={(e) => setRelatedContactName(e.target.value)}
            placeholder="相關人脈姓名"
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={handleSaveEdit}>
              儲存並核准
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium">{payload.title}</p>
          {payload.description ? <p className="text-sm text-muted-foreground">{payload.description}</p> : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {payload.relatedContactName ? <span>相關人脈：{payload.relatedContactName}</span> : null}
            {payload.companyName ? <span>公司：{payload.companyName}</span> : null}
            {payload.jobTitle ? <span>職稱：{payload.jobTitle}</span> : null}
            {payload.assignee ? <span>負責人：{payload.assignee}</span> : null}
            {payload.dueDate ? <span>截止日期：{payload.dueDate}</span> : null}
            {payload.eventDate ? <span>日期：{payload.eventDate}</span> : null}
          </div>

          {!isResolved ? (
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" disabled={isPending} onClick={handleApprove}>
                <Check className="size-4" />
                核准
              </Button>
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                編輯
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={handleReject}>
                <X className="size-4" />
                拒絕
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ExtractionReviewPanel({
  extractions,
  chatImportId,
}: {
  extractions: ChatExtractionRow[];
  chatImportId: string;
}) {
  const pending = extractions.filter((e) => e.review_status === "pending");
  const resolved = extractions.filter((e) => e.review_status !== "pending");

  return (
    <div className="space-y-4">
      {pending.length === 0 && resolved.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未執行 AI 分析，或此對話沒有新訊息需要分析。</p>
      ) : (
        <>
          {pending.map((extraction) => (
            <ExtractionCard key={extraction.id} extraction={extraction} chatImportId={chatImportId} />
          ))}
          {resolved.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">已處理（{resolved.length}）</summary>
              <div className="mt-2 space-y-2">
                {resolved.map((extraction) => (
                  <ExtractionCard key={extraction.id} extraction={extraction} chatImportId={chatImportId} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
