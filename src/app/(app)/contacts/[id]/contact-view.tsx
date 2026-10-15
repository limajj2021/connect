import { Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ContactWithIndustries } from "@/lib/contacts/queries";

const ROLE_LABEL: Record<string, string> = {
  boss: "老闆",
  non_boss: "非老闆",
  unclassified: "未分類",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function formatBirthday(contact: ContactWithIndustries) {
  if (!contact.birthday_month || !contact.birthday_day) return null;
  const base = `${contact.birthday_month} 月 ${contact.birthday_day} 日`;
  return contact.birthday_year ? `${contact.birthday_year} 年 ${base}` : base;
}

export function ContactView({ contact }: { contact: ContactWithIndustries }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{ROLE_LABEL[contact.role_type]}</Badge>
        {contact.is_important ? (
          <Badge className="gap-1 bg-amber-400 text-amber-950 hover:bg-amber-400">
            <Star className="size-3 fill-current" />
            重要人脈
          </Badge>
        ) : null}
        {contact.industries.map((ind) => (
          <Badge key={ind} variant="secondary">
            {ind}
          </Badge>
        ))}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="英文姓名" value={contact.name_en} />
        <Field label="公司名稱" value={contact.company} />
        <Field label="職稱" value={contact.title} />
        <Field label="國家 / 城市" value={[contact.country, contact.city].filter(Boolean).join(" / ") || null} />
        <Field label="電話" value={contact.phone} />
        <Field label="Email" value={contact.email} />
        <Field label="LINE 顯示名稱" value={contact.line_display_name} />
        <Field label="LINE ID" value={contact.line_id} />
        <Field label="WhatsApp" value={contact.whatsapp_phone} />
        <Field label="WeChat ID" value={contact.wechat_id} />
        <Field label="LinkedIn" value={contact.linkedin_url} />
        <Field label="Facebook" value={contact.facebook_url} />
        <Field label="認識日期" value={contact.met_date} />
        <Field label="認識管道" value={contact.met_channel} />
        <Field label="生日" value={formatBirthday(contact)} />
      </dl>

      {contact.notes ? (
        <div>
          <dt className="text-xs text-muted-foreground">備註</dt>
          <dd className="whitespace-pre-wrap text-sm">{contact.notes}</dd>
        </div>
      ) : null}
    </div>
  );
}
