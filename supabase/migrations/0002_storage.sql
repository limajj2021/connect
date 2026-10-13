-- Private storage bucket for raw LINE chat export files (F05 / F09 / security section 6)

insert into storage.buckets (id, name, public)
values ('chat-imports', 'chat-imports', false)
on conflict (id) do nothing;

-- Files are stored under `${auth.uid()}/...` so an owner can only reach their own objects.
create policy "chat_imports_storage_owner_read" on storage.objects
  for select using (
    bucket_id = 'chat-imports' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_imports_storage_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'chat-imports' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "chat_imports_storage_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'chat-imports' and (storage.foldername(name))[1] = auth.uid()::text
  );
