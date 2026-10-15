"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getLiff } from "@/lib/mini/liff-client";

interface Tag {
  id: string;
  name: string;
  contactCount: number;
}

/**
 * Rich menu → 設定 → 標籤管理: rename a tag, merge several into one (picking
 * or typing the name to keep), or delete one outright. Contact-level tagging
 * stays on each person's own edit form; this is the owner-wide view.
 */
export function TagsEditor() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

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
      const res = await fetch("/api/m/tags", { headers: { authorization: `Bearer ${idToken}` } });
      if (cancelled) return;
      if (!res.ok) {
        setErrorMessage(res.status === 401 ? "無法確認身分，請關閉後從 LINE 選單重新開啟。" : "載入失敗，請稍後再試。");
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { tags: Tag[] };
      setToken(idToken);
      setTags(json.tags);
      setStatus("ready");
    })().catch(() => {
      setErrorMessage("載入失敗，請稍後再試。");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSelect(id: string, name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 1 && !mergeName) setMergeName(name);
      return next;
    });
  }

  async function saveRename(id: string) {
    const name = drafts[id];
    if (!name) return;
    setSavingId(id);
    const res = await authedFetch("/api/m/tags", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, name }) });
    setSavingId(null);
    if (!res.ok) return;
    const { tag } = (await res.json()) as { tag: Tag };
    setTags((list) => list.map((t) => (t.id === id ? { ...t, name: tag.name } : t)));
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  async function remove(tag: Tag) {
    const warn = tag.contactCount > 0 ? `目前有 ${tag.contactCount} 位人脈用這個標籤，` : "";
    if (!window.confirm(`刪除「${tag.name}」？${warn}刪除後這些人脈會自動拿掉這個標籤，無法復原。`)) return;
    setTags((list) => list.filter((t) => t.id !== tag.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(tag.id);
      return next;
    });
    await authedFetch(`/api/m/tags?id=${tag.id}`, { method: "DELETE" });
  }

  async function merge() {
    setMergeError("");
    if (selected.size < 2) return setMergeError("請至少勾選 2 個標籤");
    if (!mergeName.trim()) return setMergeError("請輸入合併後的名稱");
    setMerging(true);
    const res = await authedFetch("/api/m/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceIds: [...selected], targetName: mergeName.trim() }),
    });
    setMerging(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setMergeError(body?.error ?? "合併失敗");
      return;
    }
    const { tag } = (await res.json()) as { tag: Tag };
    setTags((list) => [tag, ...list.filter((t) => !selected.has(t.id))]);
    setSelected(new Set());
    setMergeName("");
  }

  if (status === "loading") return <p className="p-6 text-center text-sm text-muted-foreground">載入標籤中…</p>;
  if (status === "error") return <p className="p-6 text-center text-sm text-muted-foreground">{errorMessage}</p>;

  return (
    <div className="space-y-4 p-4 pb-10">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">標籤管理</h1>
        <p className="text-xs text-muted-foreground">改名字直接編輯；勾選兩個以上可以合併成一個</p>
      </header>

      {tags.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">還沒有任何標籤。到人脈的編輯表單加標籤後會出現在這裡。</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 p-3">
              <Checkbox checked={selected.has(tag.id)} onCheckedChange={() => toggleSelect(tag.id, tag.name)} />
              <Input
                value={drafts[tag.id] ?? tag.name}
                onChange={(e) => setDrafts((d) => ({ ...d, [tag.id]: e.target.value }))}
                className="h-9 flex-1 text-base md:text-sm"
              />
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tag.contactCount} 位</span>
              {drafts[tag.id] !== undefined && drafts[tag.id] !== tag.name ? (
                <Button size="sm" onClick={() => saveRename(tag.id)} disabled={savingId === tag.id}>
                  {savingId === tag.id ? "…" : "儲存"}
                </Button>
              ) : null}
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(tag)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {selected.size >= 2 ? (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground">合併已選的 {selected.size} 個標籤</h2>
          <Input value={mergeName} onChange={(e) => setMergeName(e.target.value)} placeholder="合併後的名稱" className="text-base md:text-sm" />
          {mergeError ? <p className="text-xs text-destructive">{mergeError}</p> : null}
          <Button onClick={merge} disabled={merging} className="w-full">
            {merging ? "合併中…" : `合併成「${mergeName || "…"}」`}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
