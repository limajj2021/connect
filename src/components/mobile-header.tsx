"use client";

import { LogOut, Search } from "lucide-react";

import { signOut } from "@/app/actions";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
      <span className="text-base font-semibold">Personal CRM</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="搜尋"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
        >
          <Search className="size-4" />
        </Button>
        <ThemeToggle />
        <form action={signOut}>
          <Button variant="ghost" size="icon" type="submit" aria-label="登出">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
