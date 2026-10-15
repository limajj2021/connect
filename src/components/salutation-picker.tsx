"use client";

import { Input } from "@/components/ui/input";
import { type NamedPerson, derivedSalutation, salutationOptions } from "@/lib/contacts/naming";
import type { GreetingTone } from "@/types/database";

const TONES: { value: GreetingTone | ""; label: string }[] = [
  { value: "", label: "自動" },
  { value: "formal", label: "正式（您）" },
  { value: "casual", label: "輕鬆" },
];

/**
 * 稱呼 + 語氣 for greetings: free text with one-tap suggestions (王董, 小明,
 * Kenny 哥, 美玲姐…), and formal/casual. Empty = derived automatically, shown
 * as the placeholder so it's clear what will be used.
 */
export function SalutationPicker({
  person,
  salutation,
  onSalutationChange,
  tone,
  onToneChange,
  names = { salutation: "salutation", tone: "greeting_tone" },
}: {
  person: NamedPerson;
  salutation: string;
  onSalutationChange: (value: string) => void;
  tone: GreetingTone | "";
  onToneChange: (value: GreetingTone | "") => void;
  /** Form field names (omit hidden inputs by passing null, e.g. when saved via fetch). */
  names?: { salutation: string; tone: string } | null;
}) {
  const options = salutationOptions(person);
  return (
    <div className="space-y-2">
      <Input
        name={names?.salutation}
        value={salutation}
        onChange={(e) => onSalutationChange(e.target.value)}
        placeholder={`自動：${derivedSalutation(person) || "—"}`}
        maxLength={50}
      />
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSalutationChange(option === salutation ? "" : option)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              option === salutation ? "border-primary bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label="語氣">
        {names ? <input type="hidden" name={names.tone} value={tone} /> : null}
        {TONES.map((option) => (
          <button
            key={option.value || "auto"}
            type="button"
            role="radio"
            aria-checked={tone === option.value}
            onClick={() => onToneChange(option.value)}
            className={`flex-1 rounded-full px-2 py-1 text-xs ${
              tone === option.value ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
