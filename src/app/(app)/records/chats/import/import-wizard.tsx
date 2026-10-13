"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { AlertTriangle, Upload } from "lucide-react";

import { ContactCombobox } from "@/components/contact-combobox";
import type { ContactOption } from "@/components/contact-multi-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { importChat, type ImportActionState } from "@/lib/chat-import/actions";
import { parseLineChatExport, type ParsedChat } from "@/lib/chat-import/line-parser";
import { OWNER_SENDER_LABEL, type ParticipantMapping } from "@/lib/chat-import/schema";

const initialState: ImportActionState = {};

interface ParticipantDecision {
  contactId: string | null;
  createNew: boolean;
}

export function ImportWizard({ contactOptions }: { contactOptions: ContactOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedChat | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ParticipantDecision>>({});
  const [state, formAction, isPending] = useActionState(importChat, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const realParticipants = useMemo(
    () => parsed?.participants.filter((p) => p !== OWNER_SENDER_LABEL) ?? [],
    [parsed],
  );

  const contactsByName = useMemo(() => {
    const map = new Map<string, ContactOption>();
    for (const c of contactOptions) map.set(c.name, c);
    return map;
  }, [contactOptions]);

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setParsed(null);
    setParseError(null);
    setDecisions({});
    if (!selected) return;

    try {
      const text = await selected.text();
      const result = parseLineChatExport(text);
      if (result.messages.length === 0) {
        setParseError("無法解析任何訊息，請確認檔案是否為 LINE 聊天記錄 TXT 匯出檔");
        return;
      }
      setParsed(result);

      const initialDecisions: Record<string, ParticipantDecision> = {};
      for (const name of result.participants) {
        if (name === OWNER_SENDER_LABEL) continue;
        const existing = contactsByName.get(name);
        initialDecisions[name] = { contactId: existing?.id ?? null, createNew: !existing };
      }
      setDecisions(initialDecisions);
    } catch {
      setParseError("讀取檔案失敗");
    }
  }

  function buildMapping(): ParticipantMapping {
    const mapping: ParticipantMapping = {};
    for (const name of realParticipants) {
      const decision = decisions[name];
      if (decision?.contactId) {
        mapping[name] = { action: "link", contactId: decision.contactId };
      } else if (decision?.createNew) {
        mapping[name] = { action: "create" };
      } else {
        mapping[name] = { action: "skip" };
      }
    }
    return mapping;
  }

  const dateRange =
    parsed && parsed.messages.length > 0
      ? `${parsed.messages[0].date} ～ ${parsed.messages[parsed.messages.length - 1].date}`
      : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" />
          {file ? file.name : "選擇 LINE 聊天記錄 TXT 檔案"}
        </Button>
        {parseError ? (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {parseError}
          </p>
        ) : null}
      </div>

      {parsed ? (
        <div className="space-y-6 rounded-lg border p-4">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">聊天名稱：</span>
              {parsed.chatName ?? "（未偵測到，將以檔名識別）"}
            </p>
            <p>
              <span className="text-muted-foreground">訊息數量：</span>
              {parsed.messages.length} 則{dateRange ? `（${dateRange}）` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">類型：</span>
              {realParticipants.length > 1 ? "群組聊天" : "一對一聊天"}
            </p>
            {parsed.warnings.length > 0 ? (
              <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" />
                {parsed.warnings.length} 行內容無法辨識，已略過（不影響其餘訊息）
              </p>
            ) : null}
          </div>

          {realParticipants.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">對應人脈</p>
              {realParticipants.map((name) => {
                const decision = decisions[name] ?? { contactId: null, createNew: false };
                return (
                  <div key={name} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                    <Badge variant="outline" className="shrink-0">
                      {name}
                    </Badge>
                    <div className="w-56">
                      <ContactCombobox
                        name={`__unused_${name}`}
                        options={contactOptions}
                        value={decision.contactId}
                        onChange={(contactId) =>
                          setDecisions((prev) => ({
                            ...prev,
                            [name]: { contactId, createNew: contactId ? false : prev[name]?.createNew ?? false },
                          }))
                        }
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={decision.createNew && !decision.contactId}
                        disabled={Boolean(decision.contactId)}
                        onCheckedChange={(checked) =>
                          setDecisions((prev) => ({ ...prev, [name]: { contactId: null, createNew: Boolean(checked) } }))
                        }
                      />
                      建立同名新人脈
                    </label>
                  </div>
                );
              })}
            </div>
          ) : null}

          <form
            action={(formData) => {
              if (!file) return;
              formData.set("file", file);
              formData.set("mapping", JSON.stringify(buildMapping()));
              formAction(formData);
            }}
          >
            <Button type="submit" disabled={isPending}>
              {isPending ? "匯入中…" : "確認匯入"}
            </Button>
          </form>
        </div>
      ) : null}

      {state?.error ? (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {state.error}
          {state.existingImportId ? (
            <Link href={`/records/chats/${state.existingImportId}`} className="underline underline-offset-2">
              查看先前的匯入
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
