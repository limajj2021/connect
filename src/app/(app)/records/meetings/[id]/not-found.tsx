import Link from "next/link";
import { CalendarX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function MeetingNotFound() {
  return (
    <div className="px-4 py-10 md:px-6">
      <EmptyState
        icon={CalendarX}
        title="找不到這筆會議紀錄"
        description="可能已被刪除，或連結有誤。"
        action={<Button render={<Link href="/records" />}>返回紀錄列表</Button>}
      />
    </div>
  );
}
