import { CalendarHeart, PartyPopper, Tag } from "lucide-react";
import Link from "next/link";

const ITEMS = [
  { href: "/m/occasions", icon: PartyPopper, title: "節日提醒", desc: "自己加節日、改日期、提前幾天提醒、開關" },
  { href: "/m/festival-settings", icon: CalendarHeart, title: "人脈的節慶提醒", desc: "批量開啟或關閉：誰要收到節日與生日問候" },
  { href: "/m/tags", icon: Tag, title: "標籤管理", desc: "重新命名、合併、刪除標籤" },
] as const;

// Rich menu → 設定: just a list of links into the other LIFF settings pages.
export default function MiniSettingsPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="pt-1">
        <h1 className="text-lg font-semibold">設定</h1>
        <p className="text-xs text-muted-foreground">調整人脈小幫手的各項設定</p>
      </header>
      <ul className="divide-y rounded-xl border">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center gap-3 p-4 active:bg-muted">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <item.icon className="size-5 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.desc}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
