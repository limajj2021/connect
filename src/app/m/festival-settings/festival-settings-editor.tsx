"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getLiff } from "@/lib/mini/liff-client";

interface ContactSetting {
  id: string;
  name: string;
  company: string | null;
  festival_reminder_enabled: boolean;
}

/**
 * Rich menu → 設定 → 人脈的節慶提醒: one on/off per contact (every enabled
 * greeting occasion, or none — see /m/occasions for which occasions exist),
 * with a bulk open/close action instead of editing people one by one.
 */
export function FestivalSettingsEditor() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [contacts, setContacts] = useState<ContactSetting[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<"on" | "off" | null>(null);

  async function authedFetch(path: string, init: RequestInit = {}) {
    return fetch(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token ?? ""}` } });
  }

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
      const idToken = liff.getIDToken() ?? "";
      const res = await fetch("/api/m/festival-settings", { headers: { authorization: `Bearer ${idToken}` } });
      if (cancelled) return;
      if (!res.ok) {
        setErrorMessage(res.status === 401 ? "無法確認身分，請關閉後從 LINE 選單重新開啟。" : "載入失敗，請稍後再試。");
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { contacts: ContactSetting[] };
      setToken(idToken);
      setContacts(json.contacts);
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
    return contacts.filter((c) => [c.name, c.company].some((v) => v?.toLowerCase().includes(term)));
  }, [contacts, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function apply(enabled: boolean) {
    if (selected.size === 0) return;
    setApplying(enabled ? "on" : "off");
    const res = await authedFetch("/api/m/festival-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [...selected], enabled }),
    });
    setApplying(null);
    if (!res.ok) return;
    setContacts((list) => list.map((c) => (selected.has(c.id) ? { ...c, festival_reminder_enabled: enabled } : c)));
    setSelected(new Set());
  }

  if (status === "loading") return <p className="p-6 text-center text-sm text-muted-foreground">載入人脈中…</p>;
  if (status === "error") return <p className="p-6 text-center text-sm text-muted-foreground">{errorMessage}</p>;

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 space-y-2 border-b bg-background/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">人脈的節慶提醒</h1>
          <span className="text-xs text-muted-foreground">已選 {selected.size} 位</span>
        </div>
        <p className="text-xs text-muted-foreground">關閉的人完全不會收到節日或生日問候提醒；開啟的人每個節日都會收到。</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋姓名、公司" className="pl-8" />
        </div>
        <button type="button" onClick={selectAllFiltered} className="text-xs text-primary underline underline-offset-2">
          全選目前看到的 {filtered.length} 位
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{contacts.length === 0 ? "還沒有任何人脈" : "找不到符合的人脈"}</p>
      ) : (
        <ul className="divide-y">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name}</span>
                {c.company ? <span className="block truncate text-xs text-muted-foreground">{c.company}</span> : null}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                  c.festival_reminder_enabled
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {c.festival_reminder_enabled ? "會收到" : "已關閉"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-lg gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={() => apply(false)} disabled={applying !== null}>
              {applying === "off" ? "處理中…" : `關閉提醒（${selected.size}）`}
            </Button>
            <Button className="h-11 flex-1" onClick={() => apply(true)} disabled={applying !== null}>
              {applying === "on" ? "處理中…" : `開啟提醒（${selected.size}）`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
