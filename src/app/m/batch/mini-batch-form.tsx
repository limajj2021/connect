"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TagsInput } from "@/components/tags-input";

import { type MiniState, saveMiniBatch } from "../actions";
import { MiniDone } from "../mini-done";

export interface BatchRow {
  key: string;
  name: string;
  displayName: string | null;
  existingName: string | null;
}

/**
 * Review the people read from list screenshots: untick the ones to skip, fix
 * OCR typos in names, and tag the whole batch at once.
 */
export function MiniBatchForm({ token, rows, tagSuggestions }: { token: string; rows: BatchRow[]; tagSuggestions: string[] }) {
  const [state, formAction, isPending] = useActionState<MiniState, FormData>(saveMiniBatch.bind(null, token), {});
  const [picked, setPicked] = useState(() => new Set(rows.filter((r) => !r.existingName).map((r) => r.key)));
  const [tags, setTags] = useState<string[]>([]);

  if (state.ok) return <MiniDone message={`已建立 ${state.name} 位人脈`} returnTo="/m/contacts" />;
  if (rows.length === 0) {
    return (
      <div className="space-y-2 p-6 text-center">
        <p className="text-lg font-semibold">這批已經處理完了</p>
        <p className="text-sm text-muted-foreground">截圖的名單建立或取消後就會清空，超過 1 小時也會過期。</p>
      </div>
    );
  }

  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <form action={formAction} className="space-y-4 p-4 pb-28">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">從截圖找到 {rows.length} 位</h1>
        <p className="text-xs text-muted-foreground">勾選要建立的人；名字是 OCR 讀的，錯字可以直接改</p>
      </header>

      {state.error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}

      <ul className="divide-y rounded-xl border">
        {rows.map((row) => {
          const on = picked.has(row.key);
          return (
            <li key={row.key} className="flex items-start gap-3 p-3">
              <Checkbox
                className="mt-3 size-5"
                checked={on}
                onCheckedChange={(checked) => toggle(row.key, checked === true)}
                aria-label={`建立 ${row.name}`}
              />
              {on ? <input type="hidden" name="pick" value={row.key} /> : null}
              <div className="min-w-0 flex-1 space-y-1">
                <Input name={`name:${row.key}`} defaultValue={row.name} disabled={!on} className="text-base md:text-sm" />
                <p className="truncate text-xs text-muted-foreground">
                  {row.displayName && row.displayName !== row.name ? `LINE：${row.displayName}` : null}
                  {row.existingName ? (
                    <span className="text-amber-700 dark:text-amber-300">
                      {row.displayName && row.displayName !== row.name ? "・" : null}可能已在人脈：{row.existingName}
                    </span>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">這批都加標籤（選填）</h2>
        <TagsInput name="industries" value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="例如：印度台商、扶輪社" />
      </section>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button type="submit" className="h-12 w-full text-base" disabled={isPending || picked.size === 0}>
            {isPending ? "建立中…" : `建立 ${picked.size} 位`}
          </Button>
        </div>
      </div>
    </form>
  );
}
