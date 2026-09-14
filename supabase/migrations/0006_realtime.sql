-- 0006_realtime.sql
-- Enable realtime on items + sources (plan section 3) so an open tab stays live
-- when working across both devices. Without adding the tables to the
-- supabase_realtime publication, postgres_changes never fires.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table items;
    alter publication supabase_realtime add table sources;
  end if;
exception
  when duplicate_object then null;  -- already in the publication
end $$;
