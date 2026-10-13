"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus } from "@/lib/tasks/actions";
import type { TaskWithContact } from "@/lib/tasks/queries";

function formatDue(due: string | null) {
  if (!due) return null;
  const date = new Date(`${due}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: `已逾期 ${Math.abs(diffDays)} 天`, overdue: true };
  if (diffDays === 0) return { label: "今天", overdue: false };
  return { label: due, overdue: false };
}

export function TaskList({ tasks, showContact = true }: { tasks: TaskWithContact[]; showContact?: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle(task: TaskWithContact) {
    startTransition(async () => {
      try {
        await setTaskStatus(task.id, task.status === "pending" ? "completed" : "pending");
      } catch {
        toast.error("更新失敗，請稍後再試");
      }
    });
  }

  function skip(taskId: string) {
    startTransition(async () => {
      try {
        await setTaskStatus(taskId, "skipped");
      } catch {
        toast.error("更新失敗，請稍後再試");
      }
    });
  }

  function remove(taskId: string) {
    startTransition(async () => {
      try {
        await deleteTask(taskId);
      } catch {
        toast.error("刪除失敗，請稍後再試");
      }
    });
  }

  return (
    <ul className="divide-y">
      {tasks.map((task) => {
        const due = formatDue(task.due_date);
        return (
          <li key={task.id} className="flex items-center gap-3 py-2.5">
            <Checkbox
              checked={task.status === "completed"}
              disabled={isPending}
              onCheckedChange={() => toggle(task)}
              aria-label={task.status === "completed" ? "標記為待處理" : "標記為已完成"}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-sm", task.status === "completed" && "text-muted-foreground line-through")}>
                {task.title}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {due ? <span className={cn(due.overdue && "text-destructive")}>{due.label}</span> : null}
                {showContact && task.contact ? (
                  <Link href={`/contacts/${task.contact.id}`} className="underline-offset-2 hover:underline">
                    {task.contact.name}
                  </Link>
                ) : null}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="更多操作" />}>
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => skip(task.id)}>略過</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => remove(task.id)}>
                  刪除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
