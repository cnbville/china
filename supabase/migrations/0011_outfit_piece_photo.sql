-- 0011_outfit_piece_photo.sql
-- Let an outfit piece pin a SPECIFIC photo of its catalog item (e.g. one link
-- with 5 colours — choose the colourway you actually styled). When null, the
-- piece falls back to the item's cover.

alter table outfit_pieces add column if not exists chosen_photo_path text;
alter table outfit_pieces add column if not exists chosen_thumb_path text;
