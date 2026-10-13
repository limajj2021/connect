"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

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

import type { ContactOption } from "./contact-multi-select";

export function ContactCombobox({
  name,
  options,
  value,
  onChange,
  placeholder = "選擇人脈（選填）",
}: {
  name: string;
  options: ContactOption[];
  value: string | null;
  onChange: (next: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" />}>
        <span className={cn(!selected && "text-muted-foreground")}>{selected ? selected.name : placeholder}</span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="搜尋人脈…" />
          <CommandList>
            <CommandEmpty>找不到符合的人脈</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", !value ? "opacity-100" : "opacity-0")} />
                不指定
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
      {value ? <input type="hidden" name={name} value={value} /> : null}
    </Popover>
  );
}
