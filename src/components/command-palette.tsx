"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, CalendarPlus, LayoutDashboard, NotebookText, Settings, Upload, UserPlus, Users } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ContactLite } from "@/lib/contacts/queries";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

export function CommandPalette({ contacts }: { contacts: ContactLite[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function handleOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    };
  }, []);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="搜尋" description="搜尋人脈或跳轉頁面">
      <CommandInput placeholder="搜尋人脈、頁面或快速操作…" />
      <CommandList>
        <CommandEmpty>沒有符合的結果</CommandEmpty>

        <CommandGroup heading="快速操作">
          <CommandItem value="新增人脈" onSelect={() => go("/contacts?new=1")}>
            <UserPlus className="size-4" />
            新增人脈
          </CommandItem>
          <CommandItem value="新增會議" onSelect={() => go("/records/meetings/new")}>
            <CalendarPlus className="size-4" />
            新增會議
          </CommandItem>
          <CommandItem value="匯入聊天紀錄" onSelect={() => go("/records/chats/import")}>
            <Upload className="size-4" />
            匯入聊天紀錄
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="頁面">
          <CommandItem value="首頁 dashboard" onSelect={() => go("/")}>
            <LayoutDashboard className="size-4" />
            首頁
          </CommandItem>
          <CommandItem value="人脈 contacts" onSelect={() => go("/contacts")}>
            <Users className="size-4" />
            人脈
          </CommandItem>
          <CommandItem value="紀錄 records" onSelect={() => go("/records")}>
            <NotebookText className="size-4" />
            紀錄
          </CommandItem>
          <CommandItem value="提醒 reminders" onSelect={() => go("/reminders")}>
            <BellRing className="size-4" />
            提醒
          </CommandItem>
          <CommandItem value="設定 settings" onSelect={() => go("/settings")}>
            <Settings className="size-4" />
            設定
          </CommandItem>
        </CommandGroup>

        {contacts.length > 0 ? (
          <CommandGroup heading="人脈">
            {contacts.map((contact) => (
              <CommandItem
                key={contact.id}
                value={`${contact.name} ${contact.company ?? ""}`}
                onSelect={() => go(`/contacts/${contact.id}`)}
              >
                <Users className="size-4" />
                <span>{contact.name}</span>
                {contact.company ? <span className="ml-auto text-xs text-muted-foreground">{contact.company}</span> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
