import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { MobileHeader } from "@/components/mobile-header";
import { AUTH_USER_EMAIL_HEADER } from "@/lib/supabase/middleware";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy (middleware) already validated the session against Supabase for
  // every request that reaches here and forwards the result via this header —
  // re-checking with another Supabase Auth round trip on top of that would
  // just double the latency of every navigation for no extra safety.
  const headerList = await headers();
  const userEmail = headerList.get(AUTH_USER_EMAIL_HEADER);

  if (!userEmail) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh">
      <AppSidebar userEmail={userEmail} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
        <AppBottomNav />
      </div>
      <CommandPalette />
    </div>
  );
}
