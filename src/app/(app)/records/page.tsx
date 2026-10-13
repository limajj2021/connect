import Link from "next/link";
import { CalendarPlus, MessageSquareText, NotebookText, Upload } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listChatImports } from "@/lib/chat-import/queries";
import { listMeetings } from "@/lib/meetings/queries";

import { ChatImportList } from "./chat-import-list";
import { MeetingList } from "./meeting-list";

export default async function RecordsPage() {
  const [meetings, chatImports] = await Promise.all([listMeetings(), listChatImports()]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="紀錄"
        description="會議紀錄與 LINE 聊天匯入紀錄"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href="/records/chats/import" />}>
              <Upload className="size-4" />
              匯入聊天紀錄
            </Button>
            <Button size="sm" render={<Link href="/records/meetings/new" />}>
              <CalendarPlus className="size-4" />
              新增會議
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="meetings" className="px-4 py-4 md:px-6">
        <TabsList className="w-full md:w-fit">
          <TabsTrigger className="flex-1 md:flex-none" value="meetings">會議紀錄</TabsTrigger>
          <TabsTrigger className="flex-1 md:flex-none" value="chats">聊天匯入</TabsTrigger>
        </TabsList>

        <TabsContent value="meetings" className="pt-4">
          {meetings.length === 0 ? (
            <EmptyState
              icon={NotebookText}
              title="還沒有會議紀錄"
              description="點擊右上角「新增會議」開始記錄。"
            />
          ) : (
            <MeetingList meetings={meetings} />
          )}
        </TabsContent>

        <TabsContent value="chats" className="pt-4">
          {chatImports.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="還沒有匯入任何聊天紀錄"
              description="點擊右上角「匯入聊天紀錄」上傳 LINE 匯出的 TXT 檔案。"
            />
          ) : (
            <ChatImportList imports={chatImports} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
