"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";

export function ChatSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resync after back/forward navigation
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      if (q !== (searchParams.get("q") ?? "")) updateParam("q", q || null);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋訊息內容" className="pl-8" />
      </div>
      <Input
        type="date"
        defaultValue={searchParams.get("from") ?? ""}
        onChange={(e) => updateParam("from", e.target.value || null)}
        className="w-36"
      />
      <span className="text-sm text-muted-foreground">～</span>
      <Input
        type="date"
        defaultValue={searchParams.get("to") ?? ""}
        onChange={(e) => updateParam("to", e.target.value || null)}
        className="w-36"
      />
    </div>
  );
}
