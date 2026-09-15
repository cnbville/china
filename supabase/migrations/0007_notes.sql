-- 0007_notes.sql
-- Freeform notes keyed by scope: "general" for the whole catalog, or
-- "collection:<uuid>" for a specific collection. Powers the left-rail notepad.

create table notes (
  key        text primary key,
  body       text not null default '',
  updated_at timestamptz not null default now()
);

alter table notes enable row level security;

create policy "authenticated full access" on notes
  for all to authenticated
  using (true) with check (true);

-- Reuse the shared updated_at trigger function (migration 0003).
create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();
