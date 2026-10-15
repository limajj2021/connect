"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TagsInput } from "@/components/tags-input";
import type { InteractionRow } from "@/lib/bot/data";
import { SalutationPicker } from "@/components/salutation-picker";
import { splitName } from "@/lib/contacts/naming";
import type { ContactRow, GreetingTone, RoleType } from "@/types/database";

import { InteractionTimeline } from "./interaction-timeline";

import { type MiniState, deleteMiniContact, saveMiniContact } from "../actions";
import { MiniDone } from "../mini-done";

const ROLE_OPTIONS = [
  { value: "boss", label: "老闆" },
  { value: "non_boss", label: "非老闆" },
  { value: "unclassified", label: "未分類" },
] as const;

function Field({
  name,
  label,
  defaultValue,
  error,
  ...props
}: { name: string; label: string; defaultValue?: string | number | null; error?: string } & Omit<React.ComponentProps<"input">, "defaultValue" | "name">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        {...(props.value === undefined ? { defaultValue: defaultValue ?? "" } : {})}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The whole contact on one screen: fill or fix every field at once instead of
 * answering the bot one question at a time.
 */
export function MiniContactForm({
  token,
  contact,
  prefillName,
  interactions = [],
  tags: initialTags,
  tagSuggestions,
  returnTo,
}: {
  token: string;
  contact: ContactRow | null;
  prefillName?: string;
  interactions?: InteractionRow[];
  tags: string[];
  tagSuggestions: string[];
  returnTo?: string;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [state, formAction, isPending] = useActionState<MiniState, FormData>(
    saveMiniContact.bind(null, token, contact?.id ?? null),
    {},
  );
  const [deleted, setDeleted] = useState<MiniState | null>(null);
  const [deleting, startDelete] = useTransition();
  const [role, setRole] = useState<string>(contact?.role_type ?? "unclassified");
  const [name, setName] = useState(contact?.name ?? prefillName ?? "");
  const [nameEn, setNameEn] = useState(contact?.name_en ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [salutation, setSalutation] = useState(contact?.salutation ?? "");
  const [tone, setTone] = useState<GreetingTone | "">(contact?.greeting_tone ?? "");
  const split = splitName(name, nameEn);
  const err = (field: string) => state.fieldErrors?.[field];

  useEffect(() => {
    if (state.error) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state]);

  if (state.ok || deleted?.ok) {
    return (
      <MiniDone
        message={deleted?.ok ? "已刪除這位人脈" : contact ? `已儲存「${state.name}」` : `已新增「${state.name}」`}
        returnTo={returnTo}
      />
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-4 pb-28">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">{contact ? `編輯 ${contact.name}` : "新增人脈"}</h1>
        <p className="text-xs text-muted-foreground">一次填好，不知道的留空就好</p>
      </header>

      <InteractionTimeline interactions={interactions} />

      {state.error || deleted?.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error ?? deleted?.error}</p>
      ) : null}

      <Section title="基本資料">
        <div className="grid grid-cols-2 gap-3">
          <Field name="name" label="中文名 *" value={name} onChange={(e) => setName(e.target.value)} required error={err("name")} />
          <Field name="name_en" label="英文名" value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoCapitalize="words" />
        </div>
        {split ? (
          <button
            type="button"
            onClick={() => {
              setName(split.zh);
              setNameEn(split.en);
            }}
            className="w-full rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-left text-xs text-[var(--brand-ink)]"
          >
            💡 拆成 中文「{split.zh}」＋ 英文「{split.en}」？點一下套用
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field name="company" label="公司" defaultValue={contact?.company} />
          <Field name="title" label="職稱" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>身分</Label>
          <input type="hidden" name="role_type" value={role} />
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {ROLE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={role === option.value}
                variant={role === option.value ? "default" : "outline"}
                onClick={() => setRole(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>標籤</Label>
          <TagsInput name="industries" value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="例如：半導體、扶輪社、客戶" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="is_important" defaultChecked={contact?.is_important ?? false} />
          重要人脈
        </label>
      </Section>

      <Section title="怎麼稱呼他">
        <p className="text-xs text-muted-foreground">傳祝福、AI 客製化訊息都會用這個稱呼和語氣。</p>
        <SalutationPicker
          person={{ name, name_en: nameEn, title: title || null, role_type: role as RoleType }}
          salutation={salutation}
          onSalutationChange={setSalutation}
          tone={tone}
          onToneChange={setTone}
        />
      </Section>

      <Section title="聯絡方式">
        <Field name="phone" label="電話" type="tel" inputMode="tel" defaultValue={contact?.phone} />
        <Field name="email" label="Email" type="email" inputMode="email" defaultValue={contact?.email} error={err("email")} />
        <div className="grid grid-cols-2 gap-3">
          <Field name="line_id" label="LINE ID" defaultValue={contact?.line_id} autoCapitalize="none" />
          <Field name="line_display_name" label="LINE 名稱" defaultValue={contact?.line_display_name} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            name="whatsapp_phone"
            label="WhatsApp"
            type="tel"
            inputMode="tel"
            placeholder="+886912345678"
            defaultValue={contact?.whatsapp_phone}
          />
          <Field name="wechat_id" label="WeChat ID" defaultValue={contact?.wechat_id} autoCapitalize="none" />
        </div>
        <Field
          name="linkedin_url"
          label="LinkedIn 個人頁"
          inputMode="url"
          autoCapitalize="none"
          placeholder="linkedin.com/in/…"
          defaultValue={contact?.linkedin_url}
          error={err("linkedin_url")}
        />
        <Field
          name="facebook_url"
          label="Facebook 個人頁"
          inputMode="url"
          autoCapitalize="none"
          placeholder="facebook.com/…"
          defaultValue={contact?.facebook_url}
          error={err("facebook_url")}
        />
      </Section>

      <Section title="生日與提醒">
        <div className="grid grid-cols-3 gap-3">
          <Field name="birthday_month" label="月" type="number" inputMode="numeric" min={1} max={12} defaultValue={contact?.birthday_month} error={err("birthday_month")} />
          <Field name="birthday_day" label="日" type="number" inputMode="numeric" min={1} max={31} defaultValue={contact?.birthday_day} error={err("birthday_day")} />
          <Field name="birthday_year" label="年（選填）" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={contact?.birthday_year} />
        </div>
        <label className="flex items-center justify-between gap-2 text-sm">
          三節問候提醒
          <Switch name="festival_reminder_enabled" defaultChecked={contact?.festival_reminder_enabled ?? true} />
        </label>
      </Section>

      <Section title="備註">
        <Textarea name="notes" rows={4} defaultValue={contact?.notes ?? ""} placeholder="喜好、家人、認識經過…" />
      </Section>

      {contact ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-destructive"
          disabled={deleting}
          onClick={() => {
            if (!window.confirm(`確定刪除「${contact.name}」？相關提醒會一起刪除。`)) return;
            startDelete(async () => setDeleted(await deleteMiniContact(token, contact.id)));
          }}
        >
          {deleting ? "刪除中…" : "刪除這位人脈"}
        </Button>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button type="submit" className="h-12 w-full text-base" disabled={isPending}>
            {isPending ? "儲存中…" : contact ? "儲存" : "新增"}
          </Button>
        </div>
      </div>
    </form>
  );
}
