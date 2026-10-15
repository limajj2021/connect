-- How you address each person in a greeting ("龔董", "Kenny 哥", "美玲姐"),
-- and whether greetings to them are formal (您) or casual. Both are optional:
-- left empty, the address is derived from name + title and the tone from
-- 老闆／非老闆, as before. English names already live in contacts.name_en.
alter table public.contacts
  add column if not exists salutation text,
  add column if not exists greeting_tone text;

alter table public.contacts
  drop constraint if exists contacts_greeting_tone_check;
alter table public.contacts
  add constraint contacts_greeting_tone_check check (greeting_tone is null or greeting_tone in ('formal', 'casual'));
