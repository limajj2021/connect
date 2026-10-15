import { contactFormSchema, type ContactFormValues } from "@/lib/contacts/schema";

/** Shared by the web contact form and the LINE mini-form actions. */
export function buildContactPayload(values: ContactFormValues) {
  return {
    name: values.name,
    name_en: values.name_en ?? null,
    company: values.company ?? null,
    title: values.title ?? null,
    role_type: values.role_type,
    country: values.country ?? null,
    city: values.city ?? null,
    phone: values.phone ?? null,
    email: values.email ?? null,
    line_display_name: values.line_display_name ?? null,
    line_id: values.line_id ?? null,
    line_url: values.line_url ?? null,
    whatsapp_phone: values.whatsapp_phone ?? null,
    wechat_id: values.wechat_id ?? null,
    linkedin_url: values.linkedin_url ?? null,
    facebook_url: values.facebook_url ?? null,
    met_date: values.met_date ?? null,
    met_channel: values.met_channel ?? null,
    birthday_month: values.birthday_month ?? null,
    birthday_day: values.birthday_day ?? null,
    birthday_year: values.birthday_year ?? null,
    notes: values.notes ?? null,
    is_important: values.is_important,
    festival_reminder_enabled: values.festival_reminder_enabled,
  };
}

/** "linkedin.com/in/xxx" pasted without https:// is still a link. */
function withScheme(value: FormDataEntryValue) {
  const text = String(value).trim();
  return text && !/^https?:\/\//i.test(text) && /\./.test(text) ? `https://${text}` : text;
}

export function parseContactFormData(formData: FormData) {
  const industries = formData.getAll("industries").map(String);
  // A form that omits a field (e.g. the short LINE mini-form) means "empty",
  // not null — the schema's optional fields expect strings.
  const field = (name: string) => formData.get(name) ?? "";
  return contactFormSchema.safeParse({
    name: field("name"),
    name_en: field("name_en"),
    company: field("company"),
    title: field("title"),
    role_type: field("role_type") || "unclassified",
    country: field("country"),
    city: field("city"),
    phone: field("phone"),
    email: field("email"),
    line_display_name: field("line_display_name"),
    line_id: field("line_id"),
    line_url: field("line_url"),
    whatsapp_phone: field("whatsapp_phone"),
    wechat_id: field("wechat_id"),
    linkedin_url: withScheme(field("linkedin_url")),
    facebook_url: withScheme(field("facebook_url")),
    met_date: field("met_date"),
    met_channel: field("met_channel"),
    birthday_month: field("birthday_month"),
    birthday_day: field("birthday_day"),
    birthday_year: field("birthday_year"),
    notes: field("notes"),
    is_important: formData.get("is_important") === "on",
    festival_reminder_enabled: formData.get("festival_reminder_enabled") === "on",
    industries,
  });
}
