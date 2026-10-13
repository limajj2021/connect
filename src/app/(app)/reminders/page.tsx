import { BellRing, ListTodo } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { QuickAddTaskForm } from "@/components/quick-add-task-form";
import { ReminderList } from "@/components/reminder-list";
import { TaskList } from "@/components/task-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listContactsLite } from "@/lib/contacts/queries";
import { listReminders } from "@/lib/reminders/queries";
import { listTasks } from "@/lib/tasks/queries";
import type { FestivalKey, ReminderType, TaskStatus } from "@/types/database";

import { CustomReminderForm } from "./custom-reminder-form";
import { GenerateRemindersButton } from "./generate-reminders-button";
import { RemindersFilterBar } from "./reminders-filter-bar";
import { SendEmailsButton } from "./send-emails-button";

const FESTIVAL_KEYS = new Set(["chinese_new_year", "dragon_boat", "mid_autumn"]);

export default async function RemindersPage(props: PageProps<"/reminders">) {
  const searchParams = await props.searchParams;
  const statusParam = typeof searchParams.status === "string" ? searchParams.status : "pending";
  const typeParam = typeof searchParams.type === "string" ? searchParams.type : "all";
  const tabParam = searchParams.tab === "tasks" ? "tasks" : "reminders";

  const status: TaskStatus | undefined = statusParam === "all" ? undefined : (statusParam as TaskStatus);
  const reminderType: ReminderType | undefined = FESTIVAL_KEYS.has(typeParam)
    ? "festival"
    : typeParam === "all"
      ? undefined
      : (typeParam as ReminderType);
  const festivalKey: FestivalKey | undefined = FESTIVAL_KEYS.has(typeParam) ? (typeParam as FestivalKey) : undefined;

  const [reminders, pendingTasks, contactOptions] = await Promise.all([
    listReminders({ status, reminderType, festivalKey }),
    listTasks({ status: "pending" }),
    listContactsLite(),
  ]);

  return (
    <div className="flex flex-col">
      <PageHeader
        title="提醒"
        description="三節、生日、待辦及自訂提醒"
        actions={
          <div className="flex items-center gap-2">
            <SendEmailsButton />
            <GenerateRemindersButton />
          </div>
        }
      />

      <Tabs defaultValue={tabParam} className="px-4 py-4 md:px-6">
        <TabsList className="w-full md:w-fit">
          <TabsTrigger className="flex-1 md:flex-none" value="reminders">提醒</TabsTrigger>
          <TabsTrigger className="flex-1 md:flex-none" value="tasks">待辦事項</TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <RemindersFilterBar />
          </div>
          <CustomReminderForm contactOptions={contactOptions} />
          {reminders.length === 0 ? (
            <EmptyState icon={BellRing} title="沒有符合條件的提醒" description="可調整篩選條件，或點擊「產生本年度提醒」建立三節與生日提醒。" />
          ) : (
            <ReminderList reminders={reminders} />
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4 pt-4">
          <QuickAddTaskForm />
          {pendingTasks.length === 0 ? (
            <EmptyState icon={ListTodo} title="沒有待處理的待辦事項" />
          ) : (
            <TaskList tasks={pendingTasks} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
