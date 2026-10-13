import Link from "next/link";
import { MessageSquareX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ChatImportNotFound() {
  return (
    <div className="px-4 py-10 md:px-6">
      <EmptyState
        icon={MessageSquareX}
        title="找不到這筆聊天匯入"
        description="可能已被刪除，或連結有誤。"
        action={<Button render={<Link href="/records" />}>返回紀錄列表</Button>}
      />
    </div>
  );
}
