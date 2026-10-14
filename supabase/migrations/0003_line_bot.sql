-- LINE OA assistant: multi-messenger contact channels, LINE push deliveries,
-- and per-conversation flow state for the rule-based bot.

alter table public.contacts
  add column if not exists whatsapp_phone text,
  add column if not exists wechat_id text;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('in_app', 'email', 'line'));

-- One row per LINE user talking to the bot: the multi-step flow currently in
-- progress (e.g. asking for a new contact's missing fields one by one).
create table if not exists public.bot_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  line_user_id text not null unique,
  state jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bot_sessions enable row level security;

drop policy if exists "bot_sessions_owner_all" on public.bot_sessions;
create policy "bot_sessions_owner_all" on public.bot_sessions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop trigger if exists bot_sessions_set_updated_at on public.bot_sessions;
create trigger bot_sessions_set_updated_at
  before update on public.bot_sessions
  for each row execute function public.set_updated_at();
