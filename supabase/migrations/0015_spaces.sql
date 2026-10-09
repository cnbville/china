-- 0015_spaces.sql
-- Two sides in one app: "clothes" (everything so far) and "pc" (computer parts).
-- One big toggle in the header switches which side you see. Everything that
-- belongs to a side gets a `space` column; all existing rows default to
-- 'clothes', so nothing you already have moves or changes.
--
-- Shared between both sides (no column): sources (they follow their item),
-- item_photos / outfit_pieces / measurements (follow their parent), notes
-- (keys are prefixed per side in the app), shipping_agents.
--
-- Safe to run more than once.

do $$
declare t text;
begin
  foreach t in array array[
    'items', 'collections', 'categories', 'saved_links', 'junk_links',
    'outfits', 'measurement_sets'
  ] loop
    execute format(
      'alter table %I add column if not exists space text not null default ''clothes''',
      t
    );
    begin
      execute format(
        'alter table %I add constraint %I check (space in (''clothes'', ''pc''))',
        t, t || '_space_check'
      );
    exception when duplicate_object then null;  -- already there
    end;
    execute format('create index if not exists %I on %I (space)', t || '_space_idx', t);
  end loop;
end $$;

-- item_cards expanded i.* when it was created, so it doesn't see the new
-- column yet — rebuild it (same definition as 0004, now including `space`).
drop view if exists item_cards;
create view item_cards
with (security_invoker = on)
as
select
  i.*,
  (select s.price
     from sources s
    where s.item_id = i.id
    order by s.rank nulls last, s.price
    limit 1) as lead_price,
  (select count(*)
     from sources s
    where s.item_id = i.id) as source_count,
  (select count(distinct c)
     from sources s, unnest(s.colors) c
    where s.item_id = i.id) as color_count
from items i;
