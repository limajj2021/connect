import type { Metadata } from "next";

import { LiffBoot } from "./liff-boot";

// Mobile mini-forms opened from the LINE bot. Access is by signed link (see
// src/lib/mini/token.ts), so keep them out of search engines and never leak
// the URL (which carries the token) through the Referer header.
export const metadata: Metadata = {
  title: "Personal CRM",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function MiniLayout({ children }: LayoutProps<"/m">) {
  return (
    <div className="mini-theme mx-auto min-h-dvh w-full max-w-lg bg-background">
      <LiffBoot />
      {children}
    </div>
  );
}
