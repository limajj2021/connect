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

export function RemindersFilterBar() {
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

      <Select
        items={{
          all: "全部類型",
          chinese_new_year: "春節",
          dragon_boat: "端午節",
          mid_autumn: "中秋節",
          birthday: "生日",
          custom: "自訂",
          meeting_followup: "會議後續",
        }}
        value={type}
        onValueChange={(v) => updateParam("type", v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="類型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部類型</SelectItem>
          <SelectItem value="chinese_new_year">春節</SelectItem>
          <SelectItem value="dragon_boat">端午節</SelectItem>
          <SelectItem value="mid_autumn">中秋節</SelectItem>
          <SelectItem value="birthday">生日</SelectItem>
          <SelectItem value="custom">自訂</SelectItem>
          <SelectItem value="meeting_followup">會議後續</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
