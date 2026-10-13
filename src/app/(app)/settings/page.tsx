import { Download, Mail, Upload } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col">
      <PageHeader title="設定" description="帳號、分類、通知、資料匯入匯出" />

      <div className="grid gap-4 p-4 md:max-w-2xl md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4" />
              帳號
            </CardTitle>
            <CardDescription>單一 Email 帳號，禁止公開註冊</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{user?.email ?? "未登入"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">外觀</CardTitle>
            <CardDescription>切換淺色 / 深色模式</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4" />
              資料匯出
            </CardTitle>
            <CardDescription>匯出聯絡人 CSV，或包含完整資料的 ZIP／JSON</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              即將推出（Phase 4）
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="size-4" />
              聯絡人匯入
            </CardTitle>
            <CardDescription>自 CSV、XLSX 匯入聯絡人</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              即將推出（Phase 4）
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
