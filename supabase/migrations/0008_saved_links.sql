-- 0008_saved_links.sql
-- A stash of factory links to look at later (the "Later" tab). Deliberately
-- independent of items/sources: it's just a to-review queue of URLs you haven't
-- decided on yet. Promote one to a real item from the add-item flow when ready.

create table saved_links (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  title       text,                       -- optional label / seller name
  note        text,                       -- optional reminder to self
  created_at  timestamptz not null default now()
);

alter table saved_links enable row level security;

create policy "authenticated full access" on saved_links
  for all to authenticated
  using (true) with check (true);
