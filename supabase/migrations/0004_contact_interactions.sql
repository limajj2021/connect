-- Lightweight interaction log: "who did I talk to, and what did we talk
-- about" — one row per touch, separate from the heavier `meetings` table
-- (formal, possibly multi-contact) and from the free-text `contacts.notes`
-- field (durable facts: habits, family, how we met). Powers "上次聊到" on
-- the contact card and the full timeline in the LIFF contact page.
create table public.contact_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  occurred_on date not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_interactions enable row level security;

create policy "contact_interactions_owner_all" on public.contact_interactions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- "Last touch per contact" and "full timeline for one contact" are the only
-- two read patterns; both are served by this one index (newest first).
create index contact_interactions_contact_idx
  on public.contact_interactions (contact_id, occurred_on desc, created_at desc);
