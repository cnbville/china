-- 0004_item_cards_view.sql
-- Roll-ups for the category grid so it's one query, not N+1 (plan section 5).
--
-- security_invoker = on makes the view run with the querying user's permissions,
-- so RLS on the underlying tables still applies (Postgres 15+, which Supabase
-- runs). Without it the view would run as its owner and quietly bypass RLS.

create view item_cards
with (security_invoker = on)
as
select
  i.*,
  -- lead_price is the TOP-RANKED source's price, not the minimum. The preferred
  -- option isn't always the cheapest; the card should reflect what I'd pay.
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
