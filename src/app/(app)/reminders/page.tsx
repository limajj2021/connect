import { BellRing } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function RemindersPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="提醒" description="三節、生日、待辦及自訂提醒" />
      <div className="px-4 py-6 md:px-6">
        <EmptyState
          icon={BellRing}
          title="提醒功能即將推出"
          description="Phase 2 將加入三節、生日與自訂聯繫提醒，並支援批次查看與完成標記。"
        />
      </div>
    </div>
  );
}
