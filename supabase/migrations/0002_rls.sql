-- 0002_rls.sql
-- Row level security, on from the first migration (plan section 2).
--
-- The anon key ships in the client bundle and is readable by anyone who opens
-- devtools; RLS is the only thing standing between that key and the data.
--
-- Exactly one account exists, so "authenticated" IS the owner. No owner_id
-- columns — they'd be dead weight. If a second person ever needs access, that's
-- the moment to add ownership.

alter table collections enable row level security;
alter table categories  enable row level security;
alter table items       enable row level security;
alter table sources     enable row level security;

-- One permissive policy per table covering all commands for authenticated users.
-- `to authenticated` scopes the policy to logged-in requests; the anon role gets
-- nothing, which is the point.
create policy "authenticated full access" on collections
  for all to authenticated
  using (true) with check (true);

create policy "authenticated full access" on categories
  for all to authenticated
  using (true) with check (true);

create policy "authenticated full access" on items
  for all to authenticated
  using (true) with check (true);

create policy "authenticated full access" on sources
  for all to authenticated
  using (true) with check (true);
