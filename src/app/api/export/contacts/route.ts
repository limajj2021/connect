import { NextResponse } from "next/server";

import { listContacts } from "@/lib/contacts/queries";
import { toCsv } from "@/lib/data-export/csv";
import { createClient } from "@/lib/supabase/server";

const ROLE_LABEL: Record<string, string> = {
  boss: "老闆",
  non_boss: "非老闆",
  unclassified: "未分類",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const contacts = await listContacts();
  const rows = contacts.map((c) => ({
    name: c.name,
    name_en: c.name_en ?? "",
    company: c.company ?? "",
    title: c.title ?? "",
    role_type: ROLE_LABEL[c.role_type] ?? c.role_type,
    industries: c.industries.join("、"),
    country: c.country ?? "",
    city: c.city ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    line_display_name: c.line_display_name ?? "",
    line_id: c.line_id ?? "",
    line_url: c.line_url ?? "",
    met_date: c.met_date ?? "",
    met_channel: c.met_channel ?? "",
    birthday: c.birthday_month && c.birthday_day ? `${c.birthday_month}/${c.birthday_day}` : "",
    is_important: c.is_important ? "是" : "否",
    notes: c.notes ?? "",
  }));

  const csv = toCsv(rows, [
    { key: "name", label: "姓名" },
    { key: "name_en", label: "英文姓名" },
    { key: "company", label: "公司名稱" },
    { key: "title", label: "職稱" },
    { key: "role_type", label: "身分" },
    { key: "industries", label: "產業" },
    { key: "country", label: "國家" },
    { key: "city", label: "城市" },
    { key: "phone", label: "電話" },
    { key: "email", label: "Email" },
    { key: "line_display_name", label: "LINE 顯示名稱" },
    { key: "line_id", label: "LINE ID" },
    { key: "line_url", label: "LINE 連結" },
    { key: "met_date", label: "認識日期" },
    { key: "met_channel", label: "認識管道" },
    { key: "birthday", label: "生日（月/日）" },
    { key: "is_important", label: "重要人脈" },
    { key: "notes", label: "備註" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
