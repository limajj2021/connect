"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { getLiff } from "@/lib/mini/liff-client";

type Status = { migration: boolean; richMenu: "current" | "old" | "none" };

/**
 * 系統狀態: whether the database is up to date and the current rich menu is
 * installed — with a one-tap "更新圖文選單" (the server uses its own LINE
 * token, so nobody has to run a setup script).
 */
export function SystemPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const liff = await getLiff();
      if (!liff?.isLoggedIn()) return;
      const idToken = liff.getIDToken();
      setToken(idToken);
      const res = await fetch("/api/m/system", { headers: { authorization: `Bearer ${idToken ?? ""}` } });
      if (res.ok) setStatus((await res.json()) as Status);
    })().catch(() => undefined);
  }, []);

  if (!token) return null;

  async function updateMenu() {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/m/system", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res.ok) {
      setStatus((s) => (s ? { ...s, richMenu: "current" } : s));
      setMessage("✅ 已更新！回到聊天室，關掉再打開一次就會看到新選單。");
    } else setMessage(`更新失敗：${json.error ?? res.status}`);
  }

  return (
    <section className="mx-4 space-y-3 rounded-2xl border p-4">
      <h2 className="text-sm font-semibold">系統狀態</h2>
      {status ? (
        <ul className="space-y-1 text-sm">
          <li>{status.migration ? "✅ 資料庫已是最新" : "⚠️ 資料庫還沒更新（請在 Supabase 執行 0006、0007 migration）"}</li>
          <li>{status.richMenu === "current" ? "✅ 圖文選單是最新的兩分頁版" : "⚠️ 圖文選單還是舊版"}</li>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">檢查中…</p>
      )}
      <Button className="h-11 w-full rounded-full" disabled={busy} onClick={updateMenu}>
        {busy ? "更新中…" : status?.richMenu === "current" ? "重新套用圖文選單" : "更新圖文選單"}
      </Button>
      {message ? <p className="text-sm">{message}</p> : null}
    </section>
  );
}
