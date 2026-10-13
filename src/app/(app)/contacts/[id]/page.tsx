import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarClock, CalendarPlus, ListTodo, MessageSquareText, Upload } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuickAddTaskForm } from "@/components/quick-add-task-form";
import { TaskList } from "@/components/task-list";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listChatImportsForContact } from "@/lib/chat-import/queries";
import { findPotentialDuplicates, getContact, listIndustryNames } from "@/lib/contacts/queries";
import { listMeetingsForContact } from "@/lib/meetings/queries";
import { listTasksForContact } from "@/lib/tasks/queries";

import { ContactDetailClient } from "./contact-detail-client";
import { MeetingList } from "../../records/meeting-list";
import { ChatImportList } from "../../records/chat-import-list";

export default async function ContactDetailPage(props: PageProps<"/contacts/[id]">) {
  const { id } = await props.params;

  // Everything keyed only by the id starts at once; just the duplicate check
  // has to wait for the contact's name.
  const [contact, industrySuggestions, meetings, tasks, chatImports] = await Promise.all([
    getContact(id),
    listIndustryNames(),
    listMeetingsForContact(id),
    listTasksForContact(id),
    listChatImportsForContact(id),
  ]);

  if (!contact) {
    notFound();
  }

  const duplicates = await findPotentialDuplicates(contact.name, contact.id);

  return (
    <div className="flex flex-col">
      <PageHeader title={contact.name} description={contact.company ?? undefined} />

      <div className="space-y-4 px-4 py-4 md:px-6">
        {duplicates.length > 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              有 {duplicates.length} 筆同名人脈，
              <Link href={`/contacts?q=${encodeURIComponent(contact.name)}`} className="underline underline-offset-2">
                點此查看
              </Link>
              ，請確認是否為重複資料。
            </span>
          </div>
        ) : null}

        <Tabs defaultValue="profile">
          <TabsList className="w-full md:w-fit">
            <TabsTrigger className="flex-1 md:flex-none" value="profile">基本資料</TabsTrigger>
            <TabsTrigger className="flex-1 md:flex-none" value="meetings">會議紀錄</TabsTrigger>
            <TabsTrigger className="flex-1 md:flex-none" value="chats">聊天紀錄</TabsTrigger>
            <TabsTrigger className="flex-1 md:flex-none" value="tasks">待辦</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <ContactDetailClient contact={contact} industrySuggestions={industrySuggestions} />
          </TabsContent>

          <TabsContent value="meetings" className="pt-4">
            {meetings.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="還沒有會議紀錄"
                description="記錄與這位人脈的每次會面。"
                action={
                  <Button size="sm" render={<Link href="/records/meetings/new" />}>
                    <CalendarPlus className="size-4" />
                    新增會議
                  </Button>
                }
              />
            ) : (
              <div className="-mx-4 md:-mx-6">
                <MeetingList meetings={meetings} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="chats" className="pt-4">
            {chatImports.length === 0 ? (
              <EmptyState
                icon={MessageSquareText}
                title="還沒有相關的聊天紀錄"
                description="匯入 LINE 聊天記錄並將參與者連結到這位人脈。"
                action={
                  <Button size="sm" render={<Link href="/records/chats/import" />}>
                    <Upload className="size-4" />
                    匯入聊天紀錄
                  </Button>
                }
              />
            ) : (
              <div className="-mx-4 md:-mx-6">
                <ChatImportList imports={chatImports} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4 pt-4">
            <QuickAddTaskForm contactId={contact.id} />
            {tasks.length === 0 ? (
              <EmptyState icon={ListTodo} title="還沒有待辦事項" description="新增與這位人脈相關的待辦。" />
            ) : (
              <TaskList tasks={tasks} showContact={false} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
