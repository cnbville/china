-- 0013_measurements.sql
-- Measurements tracking (all in cm). A flexible model: a "set" is a named group
-- of measurements, of one of three kinds —
--   body      : your own body measurements (a personal size profile)
--   reference : your ideal garment specs per type (what to match listings to)
--   item      : the measurements of a specific catalogued item
-- and each set holds any number of label/value rows, so the fields can differ
-- between a tee and a pair of pants without schema changes.

create table measurement_sets (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('body', 'reference', 'item')),
  name          text not null,
  garment_type  text,                       -- Top / Bottom / … (reference & item)
  item_id       uuid references items(id) on delete cascade,  -- item kind only
  notes         text,
  created_at    timestamptz not null default now()
);
create index measurement_sets_kind_idx on measurement_sets(kind);
create index measurement_sets_item_idx on measurement_sets(item_id);

create table measurements (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references measurement_sets(id) on delete cascade,
  label       text not null,
  value_cm    numeric,                       -- nullable: add a field, fill later
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index measurements_set_idx on measurements(set_id);

alter table measurement_sets enable row level security;
alter table measurements enable row level security;

create policy "authenticated full access" on measurement_sets
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on measurements
  for all to authenticated using (true) with check (true);
