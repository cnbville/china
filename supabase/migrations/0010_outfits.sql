-- 0010_outfits.sql
-- The Outfit Creator. An outfit is a named set of pieces (catalog items, or
-- quick placeholders for things you own but don't track). The SAME pieces can be
-- arranged three ways — a freeform canvas, fixed slots, or a simple stack — so
-- every layout field lives on the piece and each view reads what it needs.

create table outfits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Untitled outfit',
  season      text,                       -- free label: "Winter", "Going out"…
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table outfit_pieces (
  id                uuid primary key default gen_random_uuid(),
  outfit_id         uuid not null references outfits (id) on delete cascade,
  item_id           uuid references items (id) on delete set null, -- null = placeholder
  placeholder_label text,                 -- for a piece you don't catalog
  photo_path        text,                 -- optional placeholder photo (full)
  thumb_path        text,                 -- optional placeholder photo (thumb)
  slot              text,                 -- slots view: outerwear/top/bottom/shoes/accessory
  sort_order        int  not null default 0,   -- stack view order
  x                 real not null default 50,  -- canvas view: % of board (0..100)
  y                 real not null default 40,
  scale             real not null default 1,
  rotation          real not null default 0,   -- degrees
  z                 int  not null default 0,    -- canvas stacking
  created_at        timestamptz not null default now()
);

create index outfit_pieces_outfit_idx on outfit_pieces (outfit_id, sort_order);

alter table outfits enable row level security;
alter table outfit_pieces enable row level security;

create policy "authenticated full access" on outfits
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on outfit_pieces
  for all to authenticated using (true) with check (true);

-- Reuse the shared updated_at trigger (migration 0003).
create trigger outfits_set_updated_at
  before update on outfits
  for each row execute function set_updated_at();
