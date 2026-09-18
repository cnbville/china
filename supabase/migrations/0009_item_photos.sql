-- 0009_item_photos.sql
-- Multiple photos per item. The gallery of all photos for an item lives here;
-- items.photo_path / items.thumb_path stay as the "cover" (what grids show), and
-- always match one of these rows. Existing single photos are backfilled as the
-- first gallery photo so nothing already uploaded is lost.

create table item_photos (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items (id) on delete cascade,
  photo_path  text not null,             -- storage object path (full image)
  thumb_path  text not null,             -- storage object path (thumbnail)
  position    int  not null default 0,   -- gallery order
  created_at  timestamptz not null default now()
);

create index item_photos_item_id_idx on item_photos (item_id, position);

alter table item_photos enable row level security;

create policy "authenticated full access" on item_photos
  for all to authenticated
  using (true) with check (true);

-- Backfill: every item that already has a photo gets it as gallery photo 0.
insert into item_photos (item_id, photo_path, thumb_path, position)
select id, photo_path, thumb_path, 0
from items
where photo_path is not null and thumb_path is not null;
