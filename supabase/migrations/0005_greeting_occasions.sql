-- Owner-editable greeting occasions, replacing the fixed 春節/端午/中秋 set —
-- any solar- or lunar-calendar date (聖誕節, 跨年, 母親節…) can be added,
-- renamed, disabled or removed from the LIFF "節日" page.
create table public.greeting_occasions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  calendar text not null check (calendar in ('lunar', 'solar')),
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  lead_days smallint not null default 7 check (lead_days between 0 and 60),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.greeting_occasions enable row level security;

create policy "greeting_occasions_owner_all" on public.greeting_occasions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create trigger greeting_occasions_set_updated_at
  before update on public.greeting_occasions
  for each row execute function public.set_updated_at();

-- `reminders.festival_key` used to be pinned to the 3 built-in festivals; it
-- now holds the greeting occasion's name directly (no join needed to render
-- an already-generated reminder, and renaming an occasion later leaves past
-- reminders' labels as they were when generated).
alter table public.reminders drop constraint if exists reminders_festival_key_check;
alter table public.reminders add constraint reminders_festival_key_check check (festival_key is null or length(festival_key) <= 100);

-- The occasion's actual (solar) date, computed once at generation time — the
-- due_date is lead-adjusted and not the date to show as "節日當天".
alter table public.reminders add column if not exists festival_date date;
