import { NotebookText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export default function RecordsPage() {
  return (
    <div className="flex flex-col">
      <PageHeader title="紀錄" description="會議紀錄與 LINE 聊天匯入紀錄" />
      <div className="px-4 py-6 md:px-6">
        <EmptyState
          icon={NotebookText}
          title="紀錄功能即將推出"
          description="Phase 2 將加入會議紀錄；Phase 3 將加入 LINE 聊天匯入與 AI 整理。"
        />
      </div>
    </div>
  );
}
