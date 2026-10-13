import Link from "next/link";
import { BellRing, CalendarClock, ListTodo, MessageSquareText, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listContacts } from "@/lib/contacts/queries";

import { QuickAddDialog } from "./contacts/quick-add-dialog";

export default async function DashboardPage() {
  const recentContacts = (await listContacts()).slice(0, 5);

  return (
    <div className="flex flex-col">
      <PageHeader title="首頁" description="今日待辦與最新動態" />

      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" />
              待聯繫提醒
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={BellRing}
              title="尚無待處理提醒"
              description="Phase 2 將加入三節、生日與自訂提醒。"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="size-4" />
              待辦事項
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState icon={ListTodo} title="尚無待辦事項" description="Phase 2 將加入會議與聊天衍生的待辦。" />
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
          </CardHeader>
          <CardContent>
            <EmptyState icon={CalendarClock} title="尚無會議紀錄" description="Phase 2 將加入會議紀錄功能。" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 px-4 pb-6 md:px-6">
        <QuickAddDialog />
        <Button variant="outline" disabled className="gap-1.5">
          <MessageSquareText className="size-4" />
          快速匯入聊天紀錄（即將推出）
        </Button>
      </div>
    </div>
  );
}
