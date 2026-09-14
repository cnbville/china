-- 0005_storage.sql
-- Private storage bucket for garment photos (plan section 2).
-- Objects live at items/{item_id}/{uuid}.webp — two per item (full + thumb).

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- storage.objects has RLS enabled by Supabase already; we just add policies
-- scoped to the photos bucket for authenticated users. Same posture as the data
-- tables: authenticated IS the single account.
create policy "authenticated read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos');

create policy "authenticated insert photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos');

create policy "authenticated update photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

create policy "authenticated delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos');
