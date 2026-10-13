"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ContactOption {
  id: string;
  name: string;
  company: string | null;
}

export function ContactMultiSelect({
  name,
  options,
  value,
  onChange,
  placeholder = "選擇相關人脈",
}: {
  name: string;
  options: ContactOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" className="w-full justify-between font-normal" />
          }
        >
          <span className="text-muted-foreground">{selected.length > 0 ? `已選擇 ${selected.length} 位` : placeholder}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="搜尋人脈…" />
            <CommandList>
              <CommandEmpty>找不到符合的人脈</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem key={option.id} value={option.name} onSelect={() => toggle(option.id)}>
                    <Check className={cn("size-4", value.includes(option.id) ? "opacity-100" : "opacity-0")} />
                    <span>{option.name}</span>
                    {option.company ? (
                      <span className="ml-auto text-xs text-muted-foreground">{option.company}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <Badge key={option.id} variant="secondary" className="gap-1">
              {option.name}
              <button type="button" aria-label={`移除 ${option.name}`} onClick={() => toggle(option.id)}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
