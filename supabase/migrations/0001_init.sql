-- Personal CRM — initial schema (PRD V1.1, section 5)
-- Single-owner app: every row is scoped to owner_id = auth.uid() and
-- protected with Row Level Security so no other account can read or write it.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- industries
-- ---------------------------------------------------------------------------
create table public.industries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.industries enable row level security;

create policy "industries_owner_all" on public.industries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  name_en text,
  company text,
  title text,
  role_type text not null default 'unclassified'
    check (role_type in ('boss', 'non_boss', 'unclassified')),
  country text,
  city text,
  phone text,
  email text,
  line_display_name text,
  line_id text,
  line_url text,
  met_date date,
  met_channel text,
  birthday_month smallint check (birthday_month between 1 and 12),
  birthday_day smallint check (birthday_day between 1 and 31),
  birthday_year smallint,
  notes text,
  is_important boolean not null default false,
  festival_reminder_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

create policy "contacts_owner_all" on public.contacts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index contacts_owner_name_idx on public.contacts (owner_id, name);
create index contacts_owner_company_idx on public.contacts (owner_id, company);
create index contacts_owner_important_idx on public.contacts (owner_id, is_important);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- contact_industries (many-to-many)
-- ---------------------------------------------------------------------------
create table public.contact_industries (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  industry_id uuid not null references public.industries (id) on delete cascade,
  primary key (contact_id, industry_id)
);

alter table public.contact_industries enable row level security;

create policy "contact_industries_owner_all" on public.contact_industries
  for all using (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- meetings
-- ---------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  meeting_date date not null,
  meeting_time time,
  location text,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meetings enable row level security;

create policy "meetings_owner_all" on public.meetings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index meetings_owner_date_idx on public.meetings (owner_id, meeting_date desc);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- meeting_contacts (many-to-many)
-- ---------------------------------------------------------------------------
create table public.meeting_contacts (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  primary key (meeting_id, contact_id)
);

alter table public.meeting_contacts enable row level security;

create policy "meeting_contacts_owner_all" on public.meeting_contacts
  for all using (
    exists (select 1 from public.meetings m where m.id = meeting_id and m.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.meetings m where m.id = meeting_id and m.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- chat_imports
-- ---------------------------------------------------------------------------
create table public.chat_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  file_hash text not null,
  storage_path text not null,
  source_chat_name text,
  chat_type text not null default 'individual' check (chat_type in ('individual', 'group')),
  primary_contact_id uuid references public.contacts (id) on delete set null,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'processing', 'completed', 'failed')),
  parse_error text,
  message_count int not null default 0,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, file_hash)
);

alter table public.chat_imports enable row level security;

create policy "chat_imports_owner_all" on public.chat_imports
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger chat_imports_set_updated_at
  before update on public.chat_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chat_participants
-- ---------------------------------------------------------------------------
create table public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  chat_import_id uuid not null references public.chat_imports (id) on delete cascade,
  display_name text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  is_linked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chat_participants enable row level security;

create policy "chat_participants_owner_all" on public.chat_participants
  for all using (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- chat_messages (parsed messages, traceable to original file)
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_import_id uuid not null references public.chat_imports (id) on delete cascade,
  speaker_display_name text,
  contact_id uuid references public.contacts (id) on delete set null,
  message_text text,
  message_type text not null default 'text',
  sent_at timestamptz,
  sequence_no int not null,
  raw_line_ref int,
  dedupe_hash text,
  -- Pre-seeded true at import time when this exact message (by dedupe_hash) was
  -- already covered by a completed analysis run on an earlier import of the same
  -- chat, so the AI pipeline never re-extracts the same topics/tasks twice.
  is_analyzed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "chat_messages_owner_all" on public.chat_messages
  for all using (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  );

create index chat_messages_import_seq_idx on public.chat_messages (chat_import_id, sequence_no);
create index chat_messages_dedupe_idx on public.chat_messages (chat_import_id, dedupe_hash);
create index chat_messages_unanalyzed_idx on public.chat_messages (chat_import_id, is_analyzed);

-- ---------------------------------------------------------------------------
-- chat_analysis_runs
-- ---------------------------------------------------------------------------
create table public.chat_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chat_import_id uuid not null references public.chat_imports (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  model_name text,
  message_range_start int,
  message_range_end int,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.chat_analysis_runs enable row level security;

create policy "chat_analysis_runs_owner_all" on public.chat_analysis_runs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- chat_extractions (AI output, pending user confirmation)
-- ---------------------------------------------------------------------------
create table public.chat_extractions (
  id uuid primary key default gen_random_uuid(),
  chat_analysis_run_id uuid not null references public.chat_analysis_runs (id) on delete cascade,
  chat_import_id uuid not null references public.chat_imports (id) on delete cascade,
  extraction_type text not null
    check (extraction_type in ('person', 'company', 'topic', 'fact', 'date_event', 'todo')),
  payload jsonb not null,
  confidence text not null default 'needs_review'
    check (confidence in ('confirmed', 'needs_review')),
  source_message_ids uuid[] not null default '{}',
  linked_contact_id uuid references public.contacts (id) on delete set null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'edited', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_extractions enable row level security;

create policy "chat_extractions_owner_all" on public.chat_extractions
  for all using (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.chat_imports ci where ci.id = chat_import_id and ci.owner_id = auth.uid())
  );

create trigger chat_extractions_set_updated_at
  before update on public.chat_extractions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks (follow-ups, from meetings, chat extractions, or manual)
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped')),
  contact_id uuid references public.contacts (id) on delete set null,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'meeting', 'chat_extraction')),
  source_meeting_id uuid references public.meetings (id) on delete set null,
  source_extraction_id uuid references public.chat_extractions (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_owner_all" on public.tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index tasks_owner_status_due_idx on public.tasks (owner_id, status, due_date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reminders (festivals, birthdays, custom, meeting follow-ups)
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  reminder_type text not null
    check (reminder_type in ('festival', 'birthday', 'custom', 'meeting_followup')),
  festival_key text check (festival_key in ('chinese_new_year', 'dragon_boat', 'mid_autumn')),
  occurrence_year int,
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Festival reminders are unique per contact/festival/year (festival_key is non-null here).
  unique (contact_id, reminder_type, festival_key, occurrence_year)
);

alter table public.reminders enable row level security;

create policy "reminders_owner_all" on public.reminders
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index reminders_owner_status_due_idx on public.reminders (owner_id, status, due_date);

-- Birthday reminders have no festival_key, so the table-level unique constraint above
-- (which treats NULL festival_key as distinct every time) would never dedupe them;
-- a partial unique index scoped to reminder_type = 'birthday' closes that gap.
create unique index reminders_birthday_contact_year_idx on public.reminders (contact_id, occurrence_year)
  where reminder_type = 'birthday';

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_deliveries
-- ---------------------------------------------------------------------------
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error_message text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.notification_deliveries enable row level security;

create policy "notification_deliveries_owner_all" on public.notification_deliveries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- app_settings (one row per owner)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Taipei',
  ai_monthly_budget_cents int,
  notify_email boolean not null default true,
  notify_in_app boolean not null default true,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings_owner_all" on public.app_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
