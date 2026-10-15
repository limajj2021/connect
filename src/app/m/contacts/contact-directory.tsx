"use client";

import { Plus, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLiff } from "@/lib/mini/liff-client";

import { type DirectoryContact, type GroupBy, groupContacts } from "./directory-groups";

function initials(name: string) {
  return name.trim().slice(0, 2);
}

/**
 * Rich menu → 人脈: every contact, grouped by tag (or role), with search.
 * Runs inside LIFF and authenticates with the owner's LIFF ID token.
 */
export function ContactDirectory() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("tag");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const liff = await getLiff();
      if (!liff) {
        setErrorMessage("請從 LINE 聊天室下方的選單開啟。");
        setStatus("error");
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const res = await fetch("/api/m/contacts", { headers: { authorization: `Bearer ${liff.getIDToken() ?? ""}` } });
      if (cancelled) return;
      if (!res.ok) {
        setErrorMessage(res.status === 401 ? "無法確認身分，請關閉後從 LINE 選單重新開啟。" : "載入失敗，請稍後再試。");
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { contacts: DirectoryContact[]; newUrl: string };
      setContacts(json.contacts);
      setNewUrl(json.newUrl);
      setStatus("ready");
    })().catch(() => {
      setErrorMessage("載入失敗，請稍後再試。");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) =>
      [c.name, c.company, c.title, ...c.tags].some((v) => v?.toLowerCase().includes(term)),
    );
  }, [contacts, query]);
  const groups = useMemo(() => groupContacts(filtered, groupBy), [filtered, groupBy]);

  if (status === "loading") return <p className="p-6 text-center text-sm text-muted-foreground">載入人脈中…</p>;
  if (status === "error") return <p className="p-6 text-center text-sm text-muted-foreground">{errorMessage}</p>;

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">人脈（{contacts.length}）</h1>
          <div className="flex rounded-lg border p-0.5 text-sm" role="tablist">
            {(["tag", "role"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={groupBy === key}
                onClick={() => setGroupBy(key)}
                className={`rounded-md px-3 py-1 ${groupBy === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {key === "tag" ? "依標籤" : "依身分"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋姓名、公司、標籤" className="pl-8" />
        </div>
        {groups.length > 1 ? (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
            {groups.map(([name, list]) => (
              <a
                key={name}
                href={`#g-${encodeURIComponent(name)}`}
                className="shrink-0 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
              >
                {name} {list.length}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{contacts.length === 0 ? "還沒有任何人脈" : "找不到符合的人脈"}</p>
      ) : (
        groups.map(([name, list]) => (
          <section key={name} id={`g-${encodeURIComponent(name)}`} className="scroll-mt-36">
            <h2 className="sticky top-[8.5rem] z-[5] bg-muted/90 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
              {name}・{list.length}
            </h2>
            <ul className="divide-y">
              {list.map((c) => (
                <li key={`${name}-${c.id}`}>
                  <a href={c.editUrl} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm">
                      {initials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate font-medium">{c.name}</span>
                        {c.is_important ? <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" /> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.title, c.company].filter(Boolean).join(" · ") || "尚無公司資訊"}
                      </span>
                    </span>
                    {c.missing > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        缺 {c.missing}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {newUrl ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-lg">
            <Button render={<a href={newUrl} />} className="h-12 w-full text-base">
              <Plus className="size-4" />
              新增人脈
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
