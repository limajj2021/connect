import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const meetingFormSchema = z.object({
  title: z.string().trim().min(1, "請輸入會議標題").max(200),
  meeting_date: z.string().trim().min(1, "請選擇日期"),
  meeting_time: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  content: z.preprocess(emptyToUndefined, z.string().trim().max(10000).optional()),
  contact_ids: z.array(z.string().uuid()).default([]),
  follow_up_title: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  follow_up_due_date: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

export type MeetingFormValues = z.infer<typeof meetingFormSchema>;
