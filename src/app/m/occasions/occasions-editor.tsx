"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getLiff } from "@/lib/mini/liff-client";

interface Occasion {
  id: string;
  name: string;
  calendar: "lunar" | "solar";
  month: number;
  day: number;
  lead_days: number;
  enabled: boolean;
}

const CALENDAR_OPTIONS = [
  { value: "lunar" as const, label: "農曆" },
  { value: "solar" as const, label: "國曆" },
];

const NEW_OCCASION: { name: string; calendar: "lunar" | "solar"; month: string; day: string; lead_days: string } = {
  name: "",
  calendar: "solar",
  month: "",
  day: "",
  lead_days: "7",
};

/**
 * Rich menu → 節日: add, edit, enable/disable or remove the owner's own
 * greeting occasions (not limited to 春節/端午/中秋) — generateReminders and
 * the daily push read directly from this list.
 */
export function OccasionsEditor() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Occasion>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newOccasion, setNewOccasion] = useState(NEW_OCCASION);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState("");

  async function authedFetch(path: string, init: RequestInit = {}) {
    const res = await fetch(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${token ?? ""}` } });
    return res;
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
      const res = await fetch("/api/m/occasions", { headers: { authorization: `Bearer ${idToken}` } });
      if (cancelled) return;
      if (!res.ok) {
        setErrorMessage(res.status === 401 ? "無法確認身分，請關閉後從 LINE 選單重新開啟。" : "載入失敗，請稍後再試。");
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { occasions: Occasion[] };
      setToken(idToken);
      setOccasions(json.occasions);
      setStatus("ready");
    })().catch(() => {
      setErrorMessage("載入失敗，請稍後再試。");
      setStatus("error");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function draftOf(o: Occasion): Occasion {
    return drafts[o.id] ?? o;
  }

  function setDraft(id: string, patch: Partial<Occasion>) {
    setOccasions((list) => {
      const base = drafts[id] ?? list.find((o) => o.id === id)!;
      setDrafts((d) => ({ ...d, [id]: { ...base, ...patch } }));
      return list;
    });
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    const res = await authedFetch("/api/m/occasions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    setSavingId(null);
    if (!res.ok) return;
    const { occasion } = (await res.json()) as { occasion: Occasion };
    setOccasions((list) => list.map((o) => (o.id === id ? occasion : o)));
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  async function toggleEnabled(o: Occasion) {
    setOccasions((list) => list.map((item) => (item.id === o.id ? { ...item, enabled: !o.enabled } : item)));
    await authedFetch("/api/m/occasions", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: o.id, enabled: !o.enabled }),
    });
  }

  async function remove(id: string) {
    if (!window.confirm("刪除這個節日？之後就不會再產生這個節日的提醒。")) return;
    setOccasions((list) => list.filter((o) => o.id !== id));
    await authedFetch(`/api/m/occasions?id=${id}`, { method: "DELETE" });
  }

  async function addOccasion() {
    setFormError("");
    const month = Number(newOccasion.month);
    const day = Number(newOccasion.day);
    if (!newOccasion.name.trim()) return setFormError("請輸入節日名稱");
    if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31) return setFormError("請輸入正確的月、日");
    setAdding(true);
    const res = await authedFetch("/api/m/occasions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...newOccasion, month, day, lead_days: Number(newOccasion.lead_days) || 0 }),
    });
    setAdding(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setFormError(body?.error ?? "新增失敗");
      return;
    }
    const { occasion } = (await res.json()) as { occasion: Occasion };
    setOccasions((list) => [...list, occasion]);
    setNewOccasion(NEW_OCCASION);
  }

  if (status === "loading") return <p className="p-6 text-center text-sm text-muted-foreground">載入節日清單中…</p>;
  if (status === "error") return <p className="p-6 text-center text-sm text-muted-foreground">{errorMessage}</p>;

  return (
    <div className="space-y-4 p-4 pb-10">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">節日提醒</h1>
        <p className="text-xs text-muted-foreground">不限三節，想加聖誕節、跨年或任何節日都可以；關閉的節日不會再產生提醒</p>
      </header>

      <ul className="space-y-3">
        {occasions.map((o) => {
          const draft = draftOf(o);
          const dirty = Boolean(drafts[o.id]);
          return (
            <li key={o.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft(o.id, { name: e.target.value })}
                  className="h-9 flex-1 text-base md:text-sm"
                />
                <Switch checked={o.enabled} onCheckedChange={() => toggleEnabled(o)} />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex rounded-lg border p-0.5 text-sm">
                  {CALENDAR_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDraft(o.id, { calendar: opt.value })}
                      className={`rounded-md px-2.5 py-1 ${draft.calendar === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">月</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={draft.month}
                    onChange={(e) => setDraft(o.id, { month: Number(e.target.value) })}
                    className="h-9 w-16 text-base md:text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">日</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.day}
                    onChange={(e) => setDraft(o.id, { day: Number(e.target.value) })}
                    className="h-9 w-16 text-base md:text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">提前幾天提醒</Label>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={draft.lead_days}
                    onChange={(e) => setDraft(o.id, { lead_days: Number(e.target.value) })}
                    className="h-9 w-16 text-base md:text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(o.id)}>
                  <Trash2 className="size-4" />
                  刪除
                </Button>
                {dirty ? (
                  <Button size="sm" onClick={() => save(o.id)} disabled={savingId === o.id}>
                    {savingId === o.id ? "儲存中…" : "儲存"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">新增節日</h2>
        <Input
          placeholder="節日名稱，例如：聖誕節"
          value={newOccasion.name}
          onChange={(e) => setNewOccasion((v) => ({ ...v, name: e.target.value }))}
          className="text-base md:text-sm"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border p-0.5 text-sm">
            {CALENDAR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setNewOccasion((v) => ({ ...v, calendar: opt.value }))}
                className={`rounded-md px-2.5 py-1 ${newOccasion.calendar === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">月</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={newOccasion.month}
              onChange={(e) => setNewOccasion((v) => ({ ...v, month: e.target.value }))}
              className="h-9 w-16 text-base md:text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">日</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={newOccasion.day}
              onChange={(e) => setNewOccasion((v) => ({ ...v, day: e.target.value }))}
              className="h-9 w-16 text-base md:text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">提前幾天</Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={newOccasion.lead_days}
              onChange={(e) => setNewOccasion((v) => ({ ...v, lead_days: e.target.value }))}
              className="h-9 w-16 text-base md:text-sm"
            />
          </div>
        </div>
        {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        <Button onClick={addOccasion} disabled={adding} className="w-full">
          <Plus className="size-4" />
          {adding ? "新增中…" : "新增節日"}
        </Button>
      </section>
    </div>
  );
}
