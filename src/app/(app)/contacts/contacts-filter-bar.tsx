"use client";

import { Search, Star } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ContactsFilterBar({ industries }: { industries: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    // Resync the draft text if the URL changes from elsewhere (back/forward navigation).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) {
        updateParam("q", q || null);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const roleType = searchParams.get("role") ?? "all";
  const industry = searchParams.get("industry") ?? "all";
  const importantOnly = searchParams.get("important") === "1";

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-6">
      <div className="relative basis-full md:min-w-48 md:flex-1 md:basis-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名、公司、LINE 名稱、備註"
          className="pl-8"
        />
      </div>

      <Select
        items={{ all: "全部身分", boss: "老闆", non_boss: "非老闆", unclassified: "未分類" }}
        value={roleType}
        onValueChange={(v) => updateParam("role", v)}
      >
        <SelectTrigger className="min-w-0 flex-1 md:w-32 md:flex-none">
          <SelectValue placeholder="身分" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部身分</SelectItem>
          <SelectItem value="boss">老闆</SelectItem>
          <SelectItem value="non_boss">非老闆</SelectItem>
          <SelectItem value="unclassified">未分類</SelectItem>
        </SelectContent>
      </Select>

      <Select
        items={{ all: "全部產業", ...Object.fromEntries(industries.map((ind) => [ind, ind])) }}
        value={industry}
        onValueChange={(v) => updateParam("industry", v)}
      >
        <SelectTrigger className="min-w-0 flex-1 md:w-36 md:flex-none">
          <SelectValue placeholder="產業" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部產業</SelectItem>
          {industries.map((ind) => (
            <SelectItem key={ind} value={ind}>
              {ind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant={importantOnly ? "default" : "outline"}
        size="sm"
        onClick={() => updateParam("important", importantOnly ? null : "1")}
        className={cn("gap-1.5")}
      >
        <Star className="size-4" />
        重要人脈
      </Button>
    </div>
  );
}
