import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BellRing, CalendarClock, MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { findPotentialDuplicates, getContact, listIndustryNames } from "@/lib/contacts/queries";

import { ContactDetailClient } from "./contact-detail-client";

export default async function ContactDetailPage(props: PageProps<"/contacts/[id]">) {
  const { id } = await props.params;

  const [contact, industrySuggestions] = await Promise.all([getContact(id), listIndustryNames()]);

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
          <TabsList>
            <TabsTrigger value="profile">基本資料</TabsTrigger>
            <TabsTrigger value="meetings">會議紀錄</TabsTrigger>
            <TabsTrigger value="chats">聊天紀錄</TabsTrigger>
            <TabsTrigger value="tasks">待辦</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <ContactDetailClient contact={contact} industrySuggestions={industrySuggestions} />
          </TabsContent>

          <TabsContent value="meetings" className="pt-4">
            <EmptyState
              icon={CalendarClock}
              title="會議紀錄即將推出"
              description="Phase 2 將加入會議紀錄功能，可記錄與這位人脈的每次會面。"
            />
          </TabsContent>

          <TabsContent value="chats" className="pt-4">
            <EmptyState
              icon={MessageSquareText}
              title="聊天紀錄即將推出"
              description="Phase 3 將支援匯入 LINE 聊天紀錄，並以 AI 整理重點。"
            />
          </TabsContent>

          <TabsContent value="tasks" className="pt-4">
            <EmptyState
              icon={BellRing}
              title="待辦事項即將推出"
              description="Phase 2 將加入待辦與提醒，協助追蹤後續聯繫事項。"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
