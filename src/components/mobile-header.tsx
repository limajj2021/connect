"use client";

import { LogOut } from "lucide-react";

import { signOut } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
      <span className="text-base font-semibold">Personal CRM</span>
      <div className="flex items-center gap-1">
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
