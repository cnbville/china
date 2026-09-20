-- 0012_junk_links.sql
-- A "junk drawer": a dead-simple scratch list of a link + a note, kept fully
-- separate from Later (saved_links). No labels, no promotion flow — just a quick
-- place to dump a URL with a reminder and come back to it.

create table junk_links (
  id          uuid primary key default gen_random_uuid(),
  url         text not null,
  note        text,                       -- optional reminder to self
  created_at  timestamptz not null default now()
);

alter table junk_links enable row level security;

create policy "authenticated full access" on junk_links
  for all to authenticated
  using (true) with check (true);
