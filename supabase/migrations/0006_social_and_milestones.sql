-- Social profiles, richer interaction timeline, and non-reminder pushes.

-- LinkedIn / Facebook profile links: one tap from the contact card to see
-- what they've been posting lately (neither platform lets anyone read other
-- people's posts through an API, so posts are archived by hand — see below).
alter table public.contacts
  add column if not exists linkedin_url text,
  add column if not exists facebook_url text;

-- What kind of touch a timeline entry is:
--   chat      — something you talked about (typed 交流, or a milestone AI
--               pulled out of an imported / forwarded chat)
--   post      — something they posted (a LinkedIn / Facebook post you
--               forwarded or screenshotted)
--   sent      — a greeting you confirmed sending
-- `source_url` keeps the post link; `chat_import_id` ties AI milestones to the
-- chat they came from, so re-analysing a chat replaces them instead of piling up.
alter table public.contact_interactions
  add column if not exists kind text not null default 'chat',
  add column if not exists source_url text,
  add column if not exists chat_import_id uuid references public.chat_imports (id) on delete cascade;

alter table public.contact_interactions
  drop constraint if exists contact_interactions_kind_check;
alter table public.contact_interactions
  add constraint contact_interactions_kind_check check (kind in ('chat', 'post', 'sent'));

create index if not exists contact_interactions_import_idx
  on public.contact_interactions (chat_import_id) where chat_import_id is not null;

-- The daily push also nudges you about people you haven't talked to in a
-- while — those pushes aren't tied to a reminder row, so the dedupe log no
-- longer requires one (the dedupe_key alone identifies what was pushed).
alter table public.notification_deliveries
  alter column reminder_id drop not null;
