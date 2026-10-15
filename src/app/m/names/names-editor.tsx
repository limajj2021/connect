"use client";

import { Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SalutationPicker } from "@/components/salutation-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { splitName } from "@/lib/contacts/naming";
import { getLiff } from "@/lib/mini/liff-client";
import type { GreetingTone, RoleType } from "@/types/database";

import { Segmented, SheetHeader } from "../sheet-ui";

interface Row {
  id: string;
  name: string;
  name_en: string | null;
  company: string | null;
  title: string | null;
  role_type: RoleType;
  salutation: string | null;
  greeting_tone: GreetingTone | null;
  is_important: boolean;
}

type Filter = "todo" | "split" | "all";
const FILTERS = [
  { value: "todo", label: "還沒設稱呼" },
  { value: "split", label: "可拆中英名" },
  { value: "all", label: "全部" },
] as const;

const FIELDS = ["name", "name_en", "salutation", "greeting_tone"] as const;

/**
 * Everyone's 中文名／英文名 and how you address them (稱呼 + 語氣) on one
 * page — greetings and AI drafts use these. Edits are kept locally and saved
 * together; "全部套用" applies every suggested Chinese/English split at once.
 */
export function NamesEditor() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [token, setToken] = useState("");
  const [original, setOriginal] = useState<Map<string, Row>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>("todo");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
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
      const res = await fetch("/api/m/names", { headers: { authorization: `Bearer ${idToken}` } });
      if (!res.ok) {
        setErrorMessage(res.status === 401 ? "無法確認身分，請關閉後從 LINE 選單重新開啟。" : "載入失敗（資料庫可能還沒更新）。");
        setStatus("error");
        return;
      }
      const { contacts } = (await res.json()) as { contacts: Row[] };
      setToken(idToken);
      setOriginal(new Map(contacts.map((c) => [c.id, c])));
      setRows(contacts);
      setStatus("ready");
    })().catch(() => {
      setErrorMessage("載入失敗，請稍後再試。");
      setStatus("error");
    });
  }, []);

  const update = (id: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const o = original.get(r.id);
        return o && FIELDS.some((f) => (r[f] ?? "") !== (o[f] ?? ""));
      }),
    [rows, original],
  );

  const shown = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "split") return rows.filter((r) => splitName(r.name, r.name_en));
    // Keep a row on screen while it's being edited, even once it has a 稱呼.
    return rows.filter((r) => !original.get(r.id)?.salutation);
  }, [rows, filter, original]);

  const splittable = rows.filter((r) => splitName(r.name, r.name_en));

  function applyAllSplits() {
    setRows((list) =>
      list.map((r) => {
        const split = splitName(r.name, r.name_en);
        return split ? { ...r, name: split.zh, name_en: split.en } : r;
      }),
    );
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const updates = changed.map((r) => {
      const o = original.get(r.id)!;
      const patch: Record<string, unknown> = { id: r.id };
      for (const f of FIELDS) if ((r[f] ?? "") !== (o[f] ?? "")) patch[f] = r[f] ?? "";
      return patch;
    });
    const res = await fetch("/api/m/names", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const json = (await res.json().catch(() => ({}))) as { updated?: number; error?: string };
    setSaving(false);
    if (!res.ok) {
      setMessage(json.error ?? "儲存失敗");
      return;
    }
    setOriginal(new Map(rows.map((r) => [r.id, r])));
    setMessage(`✅ 已儲存 ${json.updated ?? updates.length} 位`);
  }

  if (status === "loading") return <p className="p-6 text-center text-sm text-muted-foreground">載入中…</p>;
  if (status === "error") return <p className="p-6 text-center text-sm text-muted-foreground">{errorMessage}</p>;

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <SheetHeader title="稱呼與名字" subtitle="傳祝福、AI 客製化訊息都會用這裡的稱呼和語氣">
          <Segmented label="篩選" options={FILTERS} value={filter} onChange={setFilter} />
          {filter === "split" && splittable.length > 0 ? (
            <Button variant="outline" className="w-full rounded-full" onClick={applyAllSplits}>
              全部套用拆名建議（{splittable.length} 位）
            </Button>
          ) : null}
        </SheetHeader>
      </div>

      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {filter === "todo" ? "每個人都設好稱呼了 🎉" : filter === "split" ? "沒有需要拆的名字 👍" : "還沒有人脈"}
        </p>
      ) : (
        <ul className="space-y-3 p-4">
          {shown.map((r) => {
            const split = splitName(r.name, r.name_en);
            return (
              <li key={r.id} className="space-y-2 rounded-2xl border bg-card p-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {r.is_important ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}
                  {[r.title, r.company].filter(Boolean).join(" · ") || "—"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label="中文名" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="中文名" />
                  <Input
                    aria-label="英文名"
                    value={r.name_en ?? ""}
                    onChange={(e) => update(r.id, { name_en: e.target.value })}
                    placeholder="英文名"
                    autoCapitalize="words"
                  />
                </div>
                {split ? (
                  <button
                    type="button"
                    onClick={() => update(r.id, { name: split.zh, name_en: split.en })}
                    className="w-full rounded-xl bg-[var(--brand-soft)] px-3 py-1.5 text-left text-xs text-[var(--brand-ink)]"
                  >
                    💡 拆成「{split.zh}」＋「{split.en}」
                  </button>
                ) : null}
                <SalutationPicker
                  person={r}
                  salutation={r.salutation ?? ""}
                  onSalutationChange={(value) => update(r.id, { salutation: value })}
                  tone={r.greeting_tone ?? ""}
                  onToneChange={(value) => update(r.id, { greeting_tone: value || null })}
                  names={null}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg space-y-1">
          {message ? <p className="text-center text-xs">{message}</p> : null}
          <Button className="h-12 w-full rounded-full text-base" disabled={changed.length === 0 || saving} onClick={save}>
            {saving ? "儲存中…" : changed.length > 0 ? `儲存變更（${changed.length} 位）` : "沒有變更"}
          </Button>
        </div>
      </div>
    </div>
  );
}
