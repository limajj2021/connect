"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { ContactMultiSelect, type ContactOption } from "@/components/contact-multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/meetings/actions";
import type { MeetingWithContacts } from "@/lib/meetings/queries";

const initialState: ActionState = {};

export function MeetingForm({
  meeting,
  contactOptions,
  action,
  onCancel,
  onSuccess,
  submitLabel = "儲存",
}: {
  meeting?: MeetingWithContacts;
  contactOptions: ContactOption[];
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  onCancel?: () => void;
  onSuccess?: () => void;
  submitLabel?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [contactIds, setContactIds] = useState<string[]>(meeting?.contacts.map((c) => c.id) ?? []);

  useEffect(() => {
    if (state !== initialState && !state.error) {
      toast.success("已儲存變更");
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldError = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">會議標題 *</Label>
          <Input id="title" name="title" defaultValue={meeting?.title ?? ""} required />
          {fieldError("title") ? <p className="text-sm text-destructive">{fieldError("title")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="meeting_date">日期 *</Label>
          <Input id="meeting_date" name="meeting_date" type="date" defaultValue={meeting?.meeting_date ?? ""} required />
          {fieldError("meeting_date") ? <p className="text-sm text-destructive">{fieldError("meeting_date")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="meeting_time">時間</Label>
          <Input id="meeting_time" name="meeting_time" type="time" defaultValue={meeting?.meeting_time ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="location">地點</Label>
          <Input id="location" name="location" defaultValue={meeting?.location ?? ""} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>相關人脈</Label>
          <ContactMultiSelect name="contact_ids" options={contactOptions} value={contactIds} onChange={setContactIds} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">會議內容</Label>
        <Textarea id="content" name="content" rows={6} defaultValue={meeting?.content ?? ""} />
      </div>

      <div className="space-y-4 rounded-md border p-4">
        <p className="text-sm font-medium">後續待辦（選填）</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="follow_up_title">待辦內容</Label>
            <Input id="follow_up_title" name="follow_up_title" placeholder="例如：寄送提案簡報" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="follow_up_due_date">截止日期</Label>
            <Input id="follow_up_due_date" name="follow_up_due_date" type="date" />
          </div>
        </div>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "儲存中…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}
