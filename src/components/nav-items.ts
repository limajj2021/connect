import type { LucideIcon } from "lucide-react";
import { BellRing, LayoutDashboard, NotebookText, Settings, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", icon: LayoutDashboard },
  { href: "/contacts", label: "人脈", icon: Users },
  { href: "/records", label: "紀錄", icon: NotebookText },
  { href: "/reminders", label: "提醒", icon: BellRing },
  { href: "/settings", label: "設定", icon: Settings },
];
