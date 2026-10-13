import Link from "next/link";
import { BellRing, CalendarClock, ListTodo, MapPin, Upload, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ReminderList } from "@/components/reminder-list";
import { TaskList } from "@/components/task-list";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentContacts } from "@/lib/contacts/queries";
import { listMeetings } from "@/lib/meetings/queries";
import { listReminders } from "@/lib/reminders/queries";
import { listTasks } from "@/lib/tasks/queries";

import { QuickAddDialog } from "./contacts/quick-add-dialog";

export default async function DashboardPage() {
  const [recentContacts, pendingReminders, pendingTasks, recentMeetings] = await Promise.all([
    listRecentContacts(5),
    listReminders({ status: "pending" }),
    listTasks({ status: "pending", limit: 5 }),
    listMeetings(),
  ]);

  const topReminders = pendingReminders.slice(0, 5);
  const topMeetings = recentMeetings.slice(0, 5);

  return (
    <div className="flex flex-col">
      <PageHeader title="首頁" description="今日待辦與最新動態" />

      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" />
              待聯繫提醒{pendingReminders.length > 0 ? `（${pendingReminders.length}）` : ""}
            </CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/reminders" />}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            {topReminders.length === 0 ? (
              <EmptyState icon={BellRing} title="尚無待處理提醒" description="可至「提醒」頁產生本年度三節與生日提醒。" />
            ) : (
              <ReminderList reminders={topReminders} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4" />
              待辦事項{pendingTasks.length > 0 ? `（${pendingTasks.length}）` : ""}
            </CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/reminders?tab=tasks" />}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            {pendingTasks.length === 0 ? (
              <EmptyState icon={ListTodo} title="尚無待辦事項" />
            ) : (
              <TaskList tasks={pendingTasks} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              近期新增人脈
            </CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/contacts" />}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            {recentContacts.length === 0 ? (
              <EmptyState icon={Users} title="還沒有任何人脈" description="點擊下方按鈕建立第一筆資料。" />
            ) : (
              <ul className="divide-y">
                {recentContacts.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 py-2">
                      <Avatar className="size-8">
                        <AvatarFallback>{(c.name_en || c.name).slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.company || "—"}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" />
              最近會議
            </CardTitle>
            <Button variant="ghost" size="sm" render={<Link href="/records" />}>
              查看全部
            </Button>
          </CardHeader>
          <CardContent>
            {topMeetings.length === 0 ? (
              <EmptyState icon={CalendarClock} title="尚無會議紀錄" />
            ) : (
              <ul className="divide-y">
                {topMeetings.map((meeting) => (
                  <li key={meeting.id}>
                    <Link href={`/records/meetings/${meeting.id}`} className="flex flex-col gap-0.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{meeting.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{meeting.meeting_date}</span>
                      </div>
                      {meeting.location ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3.5" />
                          {meeting.location}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 px-4 pb-6 md:px-6">
        <QuickAddDialog />
        <Button variant="outline" render={<Link href="/records/chats/import" />}>
          <Upload className="size-4" />
          快速匯入聊天紀錄
        </Button>
      </div>
    </div>
  );
}
