import { redirect } from "next/navigation";

import { AppBottomNav } from "@/components/app-bottom-nav";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-svh">
      <AppSidebar userEmail={user.email ?? null} />
      <div className="flex min-h-svh flex-1 flex-col">
        <MobileHeader />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <AppBottomNav />
      </div>
    </div>
  );
}
