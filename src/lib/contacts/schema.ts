import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const roleTypeEnum = z.enum(["boss", "non_boss", "unclassified"]);

export const quickAddContactSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(200),
});

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "請輸入姓名").max(200),
  name_en: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  company: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  title: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  role_type: roleTypeEnum.default("unclassified"),
  country: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  city: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  email: z.preprocess(
    emptyToUndefined,
    z.string().trim().email("Email 格式不正確").max(200).optional(),
  ),
  line_display_name: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  line_id: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  line_url: z.preprocess(
    emptyToUndefined,
    z.string().trim().url("連結格式不正確").max(500).optional(),
  ),
  whatsapp_phone: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  wechat_id: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  linkedin_url: z.preprocess(emptyToUndefined, z.string().trim().url("連結格式不正確").max(500).optional()),
  facebook_url: z.preprocess(emptyToUndefined, z.string().trim().url("連結格式不正確").max(500).optional()),
  met_date: z.preprocess(emptyToUndefined, z.string().optional()),
  met_channel: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  birthday_month: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(12).optional(),
  ),
  birthday_day: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(31).optional(),
  ),
  birthday_year: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : Number(v)),
    z.number().int().min(1900).max(2100).optional(),
  ),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  is_important: z.boolean().default(false),
  festival_reminder_enabled: z.boolean().default(true),
  industries: z.array(z.string().trim().min(1)).default([]),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
