-- seed.sql — example data so the layouts get tested against realistic rows
-- rather than lorem ipsum (plan section 8). REPLACE this with your own 10–15
-- real items. Photos are left null here (real images go through the app's
-- client-side resize + upload); the grid shows a "no photo" placeholder.
--
-- Applied by `supabase db reset` (which runs migrations then this file), or run
-- it manually against a fresh database.

insert into collections (name) values ('SS26'), ('winter drop');
insert into categories (name) values ('hoodies'), ('tees'), ('pants'), ('outerwear');

-- Helper pattern: items reference collection/category by name; sources reference
-- items by title. Titles below are unique, so the subselects are unambiguous.

insert into items (title, type, brand, collection_id, category_id, liked, wanted, notes)
values
  ('boxy heavyweight hoodie', 'hoodie', 'Fear of God', (select id from collections where name='SS26'), (select id from categories where name='hoodies'), true, true, 'anchor piece for the drop'),
  ('cropped raw-edge hoodie', 'hoodie', null, (select id from collections where name='SS26'), (select id from categories where name='hoodies'), false, true, null),
  ('boxy pocket tee', 'tee', null, (select id from collections where name='SS26'), (select id from categories where name='tees'), true, false, '240gsm target'),
  ('heavyweight long-sleeve', 'tee', null, (select id from collections where name='winter drop'), (select id from categories where name='tees'), false, false, null),
  ('double-knee carpenter pant', 'pants', 'Carhartt', (select id from collections where name='winter drop'), (select id from categories where name='pants'), true, true, null),
  ('pleated wide trouser', 'pants', null, (select id from collections where name='SS26'), (select id from categories where name='pants'), false, false, null),
  ('nylon coach jacket', 'jacket', null, (select id from collections where name='winter drop'), (select id from categories where name='outerwear'), true, false, null),
  ('padded liner vest', 'vest', null, (select id from collections where name='winter drop'), (select id from categories where name='outerwear'), false, true, 'match to the coach jacket'),
  ('washed denim jacket', 'jacket', null, (select id from collections where name='SS26'), (select id from categories where name='outerwear'), false, false, null),
  ('ribbed beanie', 'accessory', null, (select id from collections where name='winter drop'), (select id from categories where name='hoodies'), false, false, 'placeholder category'),
  ('zip-through hoodie', 'hoodie', null, (select id from collections where name='winter drop'), (select id from categories where name='hoodies'), true, false, null),
  ('garment-dyed tee', 'tee', null, (select id from collections where name='SS26'), (select id from categories where name='tees'), false, true, null);

-- Sources: a spread of ranked/unranked, prices in CNY, colours and reasons.
insert into sources (item_id, url, seller_name, price, moq, colors, sizes, rank, reasons, notes)
values
  ((select id from items where title='boxy heavyweight hoodie'), 'https://example.com/a1', 'Factory A', 32.00, 100, '{black,ecru,navy,olive,grey,brown}', '{S,M,L,XL}', 1, '{good fabric,most colors}', '480gsm, best hand-feel of the three'),
  ((select id from items where title='boxy heavyweight hoodie'), 'https://example.com/a2', 'Factory B', 27.00, 200, '{black,ecru,navy}', '{S,M,L}', 2, '{cheapest}', null),
  ((select id from items where title='boxy heavyweight hoodie'), 'https://example.com/a3', 'Factory C', 35.00, 50, '{black}', '{M,L,XL}', null, '{}', 'low moq but pricey'),
  ((select id from items where title='cropped raw-edge hoodie'), 'https://example.com/b1', 'Factory D', 29.50, 100, '{black,white,sage}', '{S,M,L}', 1, '{best photos,responsive}', null),
  ((select id from items where title='boxy pocket tee'), 'https://example.com/c1', 'Factory E', 12.00, 300, '{white,black,sand,sage,rust}', '{S,M,L,XL}', 1, '{cheapest,most colors}', null),
  ((select id from items where title='boxy pocket tee'), 'https://example.com/c2', 'Factory F', 14.00, 150, '{white,black}', '{S,M,L}', null, '{}', null),
  ((select id from items where title='heavyweight long-sleeve'), 'https://example.com/d1', 'Factory G', 18.00, 100, '{black,charcoal}', '{M,L,XL}', null, '{}', null),
  ((select id from items where title='double-knee carpenter pant'), 'https://example.com/e1', 'Factory H', 45.00, 100, '{brown,black,khaki}', '{30,32,34,36}', 1, '{good fabric,sample received}', 'sample confirmed the weight'),
  ((select id from items where title='pleated wide trouser'), 'https://example.com/f1', 'Factory I', 38.00, 80, '{black,stone}', '{S,M,L}', 1, '{fast shipping}', null),
  ((select id from items where title='nylon coach jacket'), 'https://example.com/g1', 'Factory J', 52.00, 60, '{black,navy}', '{M,L,XL}', 1, '{low moq,responsive}', null),
  ((select id from items where title='padded liner vest'), 'https://example.com/h1', 'Factory K', 41.00, 100, '{black,olive}', '{M,L}', null, '{}', null),
  ((select id from items where title='washed denim jacket'), 'https://example.com/i1', 'Factory L', 48.00, 120, '{indigo,washed-blue}', '{M,L,XL}', null, '{}', null),
  ((select id from items where title='zip-through hoodie'), 'https://example.com/k1', 'Factory M', 30.00, 100, '{black,grey,navy}', '{S,M,L,XL}', 1, '{good fabric}', null),
  ((select id from items where title='garment-dyed tee'), 'https://example.com/l1', 'Factory N', 15.50, 200, '{faded-black,clay,moss}', '{S,M,L}', 1, '{best photos}', null);
