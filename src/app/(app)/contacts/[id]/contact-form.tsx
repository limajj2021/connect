"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TagsInput } from "@/components/tags-input";
import type { ActionState } from "@/lib/contacts/actions";
import type { ContactWithIndustries } from "@/lib/contacts/queries";

const initialState: ActionState = {};

export function ContactForm({
  contact,
  industrySuggestions,
  action,
  onCancel,
  onSuccess,
}: {
  contact: ContactWithIndustries;
  industrySuggestions: string[];
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  onCancel: () => void;
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [industries, setIndustries] = useState<string[]>(contact.industries);

  useEffect(() => {
    if (state !== initialState && !state.error) {
      toast.success("已儲存變更");
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldError = (field: string) => state?.fieldErrors?.[field];

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">姓名 *</Label>
          <Input id="name" name="name" defaultValue={contact.name} required />
          {fieldError("name") ? <p className="text-sm text-destructive">{fieldError("name")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="name_en">英文姓名</Label>
          <Input id="name_en" name="name_en" defaultValue={contact.name_en ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">公司名稱</Label>
          <Input id="company" name="company" defaultValue={contact.company ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">職稱</Label>
          <Input id="title" name="title" defaultValue={contact.title ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role_type">身分</Label>
          <Select
            name="role_type"
            items={{ unclassified: "未分類", boss: "老闆", non_boss: "非老闆" }}
            defaultValue={contact.role_type}
          >
            <SelectTrigger id="role_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unclassified">未分類</SelectItem>
              <SelectItem value="boss">老闆</SelectItem>
              <SelectItem value="non_boss">非老闆</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>產業</Label>
          <TagsInput name="industries" value={industries} onChange={setIndustries} suggestions={industrySuggestions} placeholder="輸入後按 Enter 新增" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">國家</Label>
          <Input id="country" name="country" defaultValue={contact.country ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">城市</Label>
          <Input id="city" name="city" defaultValue={contact.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">電話</Label>
          <Input id="phone" name="phone" defaultValue={contact.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={contact.email ?? ""} />
          {fieldError("email") ? <p className="text-sm text-destructive">{fieldError("email")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="line_display_name">LINE 顯示名稱</Label>
          <Input id="line_display_name" name="line_display_name" defaultValue={contact.line_display_name ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="line_id">LINE ID</Label>
          <Input id="line_id" name="line_id" defaultValue={contact.line_id ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="line_url">LINE 連結</Label>
          <Input id="line_url" name="line_url" defaultValue={contact.line_url ?? ""} placeholder="https://line.me/ti/p/..." />
          {fieldError("line_url") ? <p className="text-sm text-destructive">{fieldError("line_url")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp_phone">WhatsApp 電話</Label>
          <Input id="whatsapp_phone" name="whatsapp_phone" type="tel" defaultValue={contact.whatsapp_phone ?? ""} placeholder="+886912345678" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wechat_id">WeChat ID</Label>
          <Input id="wechat_id" name="wechat_id" defaultValue={contact.wechat_id ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedin_url">LinkedIn</Label>
          <Input id="linkedin_url" name="linkedin_url" defaultValue={contact.linkedin_url ?? ""} placeholder="https://www.linkedin.com/in/..." />
          {fieldError("linkedin_url") ? <p className="text-sm text-destructive">{fieldError("linkedin_url")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="facebook_url">Facebook</Label>
          <Input id="facebook_url" name="facebook_url" defaultValue={contact.facebook_url ?? ""} placeholder="https://www.facebook.com/..." />
          {fieldError("facebook_url") ? <p className="text-sm text-destructive">{fieldError("facebook_url")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="met_date">認識日期</Label>
          <Input id="met_date" name="met_date" type="date" defaultValue={contact.met_date ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="met_channel">認識管道</Label>
          <Input id="met_channel" name="met_channel" defaultValue={contact.met_channel ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>生日（月／日，年份可留白）</Label>
          <div className="flex gap-2">
            <Input
              name="birthday_month"
              type="number"
              min={1}
              max={12}
              placeholder="月"
              defaultValue={contact.birthday_month ?? ""}
            />
            <Input
              name="birthday_day"
              type="number"
              min={1}
              max={31}
              placeholder="日"
              defaultValue={contact.birthday_day ?? ""}
            />
            <Input
              name="birthday_year"
              type="number"
              min={1900}
              max={2100}
              placeholder="年（選填）"
              defaultValue={contact.birthday_year ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">備註</Label>
        <Textarea id="notes" name="notes" rows={4} defaultValue={contact.notes ?? ""} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="is_important" defaultChecked={contact.is_important} />
          重要人脈
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch name="festival_reminder_enabled" defaultChecked={contact.festival_reminder_enabled} />
          三節提醒
        </label>
      </div>

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "儲存中…" : "儲存"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
