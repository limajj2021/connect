"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { importContacts, type ImportSummary } from "@/lib/contacts/import";

const initialState: ImportSummary = {};

export function ImportContactsForm() {
  const [state, formAction, isPending] = useActionState(importContacts, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="file" name="file" accept=".csv,.xlsx,.xls" required className="text-sm" />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "匯入中…" : "開始匯入"}
      </Button>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.created !== undefined ? (
        <div className="text-sm text-muted-foreground">
          <p>
            成功新增 {state.created} 筆，略過 {state.skipped} 筆
          </p>
          {state.skippedReasons && state.skippedReasons.length > 0 ? (
            <ul className="list-inside list-disc">
              {state.skippedReasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
