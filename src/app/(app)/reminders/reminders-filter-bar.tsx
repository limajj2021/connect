"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RemindersFilterBar({ occasionNames }: { occasionNames: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "pending";
  const type = searchParams.get("type") ?? "all";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const typeItems: Record<string, string> = {
    all: "全部類型",
    ...Object.fromEntries(occasionNames.map((name) => [name, name])),
    birthday: "生日",
    custom: "自訂",
    meeting_followup: "會議後續",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={{ pending: "待處理", completed: "已完成", skipped: "已略過", all: "全部狀態" }}
        value={status}
        onValueChange={(v) => updateParam("status", v)}
      >
        <SelectTrigger className="w-32">
          <SelectValue placeholder="狀態" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">待處理</SelectItem>
          <SelectItem value="completed">已完成</SelectItem>
          <SelectItem value="skipped">已略過</SelectItem>
          <SelectItem value="all">全部狀態</SelectItem>
        </SelectContent>
      </Select>

      <Select items={typeItems} value={type} onValueChange={(v) => updateParam("type", v)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="類型" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(typeItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
