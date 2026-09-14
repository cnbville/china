-- 0001_init.sql
-- Core schema for the sourcing catalog: collections, categories, items, sources.
-- The item/source split is the central decision (plan section 1): everything that
-- varies between suppliers lives on `sources`, not on `items`.

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

create table collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- "SS26", "winter drop"
  created_at  timestamptz not null default now()
);

create table categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null              -- "hoodies", "tees", "pants"
);

create table items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,           -- "boxy heavyweight hoodie"
  photo_path    text,                    -- storage object path (full image)
  thumb_path    text,                    -- storage object path (grid thumbnail)
  type          text,
  brand         text,                    -- reference brand, if based on one
  collection_id uuid references collections (id) on delete set null,
  category_id   uuid references categories (id) on delete set null,
  liked         boolean not null default false,
  wanted        boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table sources (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items (id) on delete cascade,
  url          text not null,
  seller_name  text,                     -- plain label, NOT a foreign key
  price        numeric(10, 2),           -- per unit, CNY
  moq          int,
  colors       text[] not null default '{}',  -- colors this specific link offers
  sizes        text[] not null default '{}',
  rank         int,                      -- 1 = preferred, within this item
  reasons      text[] not null default '{}',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Finding a link already saved under the same item should fail cleanly so the
  -- UI can say "already saved here" rather than creating a duplicate row.
  constraint sources_item_url_unique unique (item_id, url)
);

-- Indexes (plan section 1).
create index sources_item_id_idx on sources (item_id);
create index items_category_id_idx on items (category_id);
create index items_collection_id_idx on items (collection_id);
-- GIN on colors for colour filtering ("does any source carry this colour").
create index sources_colors_gin on sources using gin (colors);
