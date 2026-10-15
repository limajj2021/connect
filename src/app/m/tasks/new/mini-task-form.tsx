"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type MiniState, saveMiniTask } from "../../actions";
import { MiniDone } from "../../mini-done";

function addDays(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextMonday(ymd: string) {
  const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return addDays(ymd, ((8 - weekday) % 7) || 7);
}

export function MiniTaskForm({
  token,
  today,
  contacts,
  defaultContactId,
}: {
  token: string;
  today: string;
  contacts: { id: string; name: string }[];
  defaultContactId: string;
}) {
  const [state, formAction, isPending] = useActionState<MiniState, FormData>(saveMiniTask.bind(null, token), {});
  const [due, setDue] = useState("");

  if (state.ok) return <MiniDone message={`已新增待辦「${state.name}」`} />;

  const quickDates = [
    { label: "今天", value: today },
    { label: "明天", value: addDays(today, 1) },
    { label: "下週一", value: nextMonday(today) },
    { label: "一週後", value: addDays(today, 7) },
    { label: "不設", value: "" },
  ];

  return (
    <form action={formAction} className="space-y-4 p-4">
      <h1 className="pt-1 text-lg font-semibold">新增待辦</h1>
      {state.error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}

      <div className="space-y-1.5">
        <Label htmlFor="title">要做什麼？</Label>
        <Input id="title" name="title" required autoFocus placeholder="例如：寄報價單" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="due_date">期限</Label>
        <div className="flex flex-wrap gap-2">
          {quickDates.map((option) => (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant={due === option.value ? "default" : "outline"}
              onClick={() => setDue(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Input id="due_date" name="due_date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact_id">相關人脈</Label>
        <select
          id="contact_id"
          name="contact_id"
          defaultValue={defaultContactId}
          className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base md:h-8 md:text-sm dark:bg-input/30"
        >
          <option value="">（不指定）</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" className="h-12 w-full text-base" disabled={isPending}>
        {isPending ? "新增中…" : "新增待辦"}
      </Button>
    </form>
  );
}
