"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteReminder, setReminderStatus } from "@/lib/reminders/actions";
import { FESTIVAL_LABELS } from "@/lib/reminders/taiwan-holidays";
import type { ReminderWithContact } from "@/lib/reminders/queries";

const TYPE_LABELS: Record<string, string> = {
  festival: "節日",
  birthday: "生日",
  custom: "自訂",
  meeting_followup: "會議後續",
};

function reminderLabel(reminder: ReminderWithContact) {
  if (reminder.reminder_type === "festival" && reminder.festival_key) {
    return FESTIVAL_LABELS[reminder.festival_key];
  }
  return TYPE_LABELS[reminder.reminder_type] ?? reminder.reminder_type;
}

export function ReminderList({ reminders }: { reminders: ReminderWithContact[] }) {
  const [isPending, startTransition] = useTransition();

  function toggle(reminder: ReminderWithContact) {
    startTransition(async () => {
      try {
        await setReminderStatus(reminder.id, reminder.status === "pending" ? "completed" : "pending");
      } catch {
        toast.error("更新失敗，請稍後再試");
      }
    });
  }

  function skip(id: string) {
    startTransition(async () => {
      try {
        await setReminderStatus(id, "skipped");
      } catch {
        toast.error("更新失敗，請稍後再試");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteReminder(id);
      } catch {
        toast.error("刪除失敗，請稍後再試");
      }
    });
  }

  return (
    <ul className="divide-y">
      {reminders.map((reminder) => (
        <li key={reminder.id} className="flex items-center gap-3 py-2.5">
          <Checkbox
            checked={reminder.status === "completed"}
            disabled={isPending}
            onCheckedChange={() => toggle(reminder)}
            aria-label={reminder.status === "completed" ? "標記為待處理" : "標記為已完成"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{reminderLabel(reminder)}</Badge>
              {reminder.contact ? (
                <Link
                  href={`/contacts/${reminder.contact.id}`}
                  className={cn(
                    "text-sm font-medium underline-offset-2 hover:underline",
                    reminder.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {reminder.contact.name}
                </Link>
              ) : (
                <span className="text-sm text-muted-foreground">（未指定人脈）</span>
              )}
              <span className="text-xs text-muted-foreground">{reminder.due_date}</span>
            </div>
            {reminder.notes ? <p className="truncate text-xs text-muted-foreground">{reminder.notes}</p> : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="更多操作" />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => skip(reminder.id)}>略過</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => remove(reminder.id)}>
                刪除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
}
