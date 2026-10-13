"use client";

import { X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";

export function TagsInput({
  name,
  value,
  onChange,
  suggestions = [],
  placeholder,
}: {
  name: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const filteredSuggestions = useMemo(() => {
    const term = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s))
      .filter((s) => (term ? s.toLowerCase().includes(term) : true))
      .slice(0, 6);
  }, [draft, suggestions, value]);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/50">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              aria-label={`移除 ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="rounded-full hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {filteredSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {value.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
    </div>
  );
}
