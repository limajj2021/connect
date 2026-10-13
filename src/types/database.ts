export type RoleType = "boss" | "non_boss" | "unclassified";

export type TaskStatus = "pending" | "completed" | "skipped";

export type ReminderType = "festival" | "birthday" | "custom" | "meeting_followup";

export type FestivalKey = "chinese_new_year" | "dragon_boat" | "mid_autumn";

export type ChatType = "individual" | "group";

export type ParseStatus = "pending" | "processing" | "completed" | "failed";

export type ExtractionType = "person" | "company" | "topic" | "fact" | "date_event" | "todo";

export type ReviewStatus = "pending" | "accepted" | "edited" | "rejected";

export interface ContactRow {
  id: string;
  owner_id: string;
  name: string;
  name_en: string | null;
  company: string | null;
  title: string | null;
  role_type: RoleType;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  line_display_name: string | null;
  line_id: string | null;
  line_url: string | null;
  met_date: string | null;
  met_channel: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  birthday_year: number | null;
  notes: string | null;
  is_important: boolean;
  festival_reminder_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface IndustryRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface MeetingRow {
  id: string;
  owner_id: string;
  title: string;
  meeting_date: string;
  meeting_time: string | null;
  location: string | null;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: TaskStatus;
  contact_id: string | null;
  source_type: "manual" | "meeting" | "chat_extraction";
  source_meeting_id: string | null;
  source_extraction_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderRow {
  id: string;
  owner_id: string;
  contact_id: string | null;
  reminder_type: ReminderType;
  festival_key: FestivalKey | null;
  occurrence_year: number | null;
  due_date: string;
  status: TaskStatus;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatImportRow {
  id: string;
  owner_id: string;
  file_name: string;
  file_hash: string;
  storage_path: string;
  source_chat_name: string | null;
  chat_type: ChatType;
  primary_contact_id: string | null;
  parse_status: ParseStatus;
  parse_error: string | null;
  message_count: number;
  imported_at: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  chat_import_id: string;
  speaker_display_name: string | null;
  contact_id: string | null;
  message_text: string | null;
  message_type: string;
  sent_at: string | null;
  sequence_no: number;
  raw_line_ref: number | null;
  dedupe_hash: string | null;
  created_at: string;
}

export interface ChatExtractionRow {
  id: string;
  chat_analysis_run_id: string;
  chat_import_id: string;
  extraction_type: ExtractionType;
  payload: Record<string, unknown>;
  confidence: "confirmed" | "needs_review";
  source_message_ids: string[];
  linked_contact_id: string | null;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsRow {
  id: string;
  owner_id: string;
  timezone: string;
  ai_monthly_budget_cents: number | null;
  notify_email: boolean;
  notify_in_app: boolean;
  theme: "system" | "light" | "dark";
  created_at: string;
  updated_at: string;
}

type NoRelationships = { Relationships: [] };

// Minimal hand-written Database type (no generated Supabase types yet — there is
// no live project to introspect). Extend the `Tables` map as new tables are wired
// into the UI; `supabase gen types typescript` can replace this once a project exists.
export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: ContactRow;
        Insert: Partial<ContactRow> & { name: string };
        Update: Partial<ContactRow>;
      } & NoRelationships;
      industries: {
        Row: IndustryRow;
        Insert: Partial<IndustryRow> & { name: string };
        Update: Partial<IndustryRow>;
      } & NoRelationships;
      contact_industries: {
        Row: { contact_id: string; industry_id: string };
        Insert: { contact_id: string; industry_id: string };
        Update: { contact_id?: string; industry_id?: string };
      } & NoRelationships;
      meetings: {
        Row: MeetingRow;
        Insert: Partial<MeetingRow> & { title: string; meeting_date: string };
        Update: Partial<MeetingRow>;
      } & NoRelationships;
      tasks: {
        Row: TaskRow;
        Insert: Partial<TaskRow> & { title: string };
        Update: Partial<TaskRow>;
      } & NoRelationships;
      reminders: {
        Row: ReminderRow;
        Insert: Partial<ReminderRow> & { reminder_type: ReminderType; due_date: string };
        Update: Partial<ReminderRow>;
      } & NoRelationships;
      chat_imports: {
        Row: ChatImportRow;
        Insert: Partial<ChatImportRow>;
        Update: Partial<ChatImportRow>;
      } & NoRelationships;
      chat_messages: {
        Row: ChatMessageRow;
        Insert: Partial<ChatMessageRow>;
        Update: Partial<ChatMessageRow>;
      } & NoRelationships;
      chat_extractions: {
        Row: ChatExtractionRow;
        Insert: Partial<ChatExtractionRow>;
        Update: Partial<ChatExtractionRow>;
      } & NoRelationships;
      app_settings: {
        Row: AppSettingsRow;
        Insert: Partial<AppSettingsRow>;
        Update: Partial<AppSettingsRow>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
