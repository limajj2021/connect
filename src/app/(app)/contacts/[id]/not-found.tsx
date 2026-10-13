import Link from "next/link";
import { UserX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="px-4 py-10 md:px-6">
      <EmptyState
        icon={UserX}
        title="找不到這位人脈"
        description="可能已被刪除，或連結有誤。"
        action={
          <Button render={<Link href="/contacts" />}>返回人脈列表</Button>
        }
      />
    </div>
  );
}
