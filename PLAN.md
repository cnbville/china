# Sourcing Catalog — Build Plan

A private catalog for tracking garments I'm considering for my clothing line.
Single user, two devices — laptop at the desk, phone while sourcing.

The problem it solves: factory links currently live scattered across chats,
screenshots and spreadsheets. This puts them in one browsable library, where
each garment holds every link I've found for it, ranked by which one I'd
actually order from — and the same library is there on both devices.

---

## How to use this document

This is a spec, not a starting point for suggestions.

- **Section 1 is settled.** The item/source split, rank as an ordinal, and the
  absence of a supplier table are decisions already argued through. Don't
  redesign them.
- **Section 9 is a hard boundary.** Nothing on that list gets built, including
  as a "quick" partial version.
- Ambiguity elsewhere is fine to resolve yourself — naming, file layout,
  component structure, anything not stated here.
- If something in the plan turns out to be wrong or unbuildable as written,
  **say so and stop**. Don't work around it silently.
- Follow the build order in section 8. Each step should run before the next
  one starts.

---

## 1. Core model

Two levels. This is the most important decision in the project — everything
else follows from it.

**Item** — the garment concept. One hoodie is one item, no matter how many
factories can make it.

**Source** — one listing/link. An item has many sources. Everything that
varies between suppliers lives here, not on the item.

```sql
collections
  id            uuid pk default gen_random_uuid()
  name          text            -- "SS26", "winter drop"
  created_at    timestamptz default now()

categories
  id            uuid pk
  name          text            -- "hoodies", "tees", "pants"

items
  id            uuid pk
  title         text            -- "boxy heavyweight hoodie"
  photo_path    text            -- storage object path
  thumb_path    text
  type          text
  brand         text            -- reference brand, if based on one
  collection_id uuid → collections
  category_id   uuid → categories
  liked         bool default false
  wanted        bool default false
  notes         text
  created_at    timestamptz default now()
  updated_at    timestamptz default now()

sources
  id            uuid pk
  item_id       uuid → items on delete cascade
  url           text
  seller_name   text            -- plain label, NOT a foreign key
  price         numeric(10,2)   -- per unit, CNY
  moq           int null
  colors        text[]          -- colors this specific link offers
  sizes         text[]
  rank          int null        -- 1 = preferred, within this item
  reasons       text[]
  notes         text
  created_at    timestamptz default now()
  updated_at    timestamptz default now()
```

Indexes: `sources(item_id)`, `items(category_id)`, `items(collection_id)`,
GIN on `sources.colors` for colour filtering.

Constraint: `unique (item_id, url)` on `sources`. Finding a link I've already
saved under the same item will happen; the insert should fail cleanly and the
UI should say "already saved here" rather than creating a duplicate row.

**Currency: CNY only.** One number, one currency, no conversion. Landed cost in
EUR — shipping, duty, the rate on the day — is a genuinely different problem and
isn't part of this app. If I want it later it's a new field and a new
conversation, not a rework.

### Why price/colors/sizes sit on Source

Factory A quotes ¥30 in six colors. Factory B quotes ¥27 in three. If price
lives on the item, that's unrepresentable. On the source, it's trivial.

This also handles multi-links — a listing offering 20+ colors is just a source
with a long `colors` array. No special case needed.

### Rank and reasons

`rank` is ordinal within an item, not a score. 1 is the one I'd order from.
Ordinal because I'm only ever comparing links I'm looking at side by side — a
1–10 score assigned in January means nothing against one from March.

`reasons` is a fixed tag set, picked from a list, never free text:

```
cheapest · best photos · good fabric · responsive · sample received
low moq · fast shipping · most colors
```

Without these, "rank 1" is meaningless four months later. Required when a rank
is set.

### No supplier table

Deliberate. I source by listing, not by relationship. If the same seller shows
up under two items that's incidental — `seller_name` is a label I can read, not
an entity with its own record.

---

## 2. Backend — Supabase

Postgres, Storage and Auth from one project. The catalog lives on the server;
both devices read the same data.

### Auth

One account, email + password, created manually in the dashboard. **Sign-ups
disabled** in project settings so nobody else can create one.

This exists to keep the data private now that it's on the internet, not to
support users. There's no profile, no settings, no password reset flow — just a
login screen and a session that persists.

### Row level security

RLS **on for every table**, from the first migration. Not later. The anon key
ships in the client bundle and is readable by anyone who opens devtools; RLS is
the only thing standing between that key and the data.

Policy on every table, for select/insert/update/delete:

```sql
using (auth.role() = 'authenticated')
```

Since exactly one account exists, authenticated *is* me. No `owner_id` columns —
they'd be dead weight. If a second person ever needs access, that's the moment
to add ownership, and it's a small migration.

### Storage

Private bucket `photos`. Objects at `items/{item_id}/{uuid}.webp`.

Upload goes straight from the browser to Storage via `supabase-js`, never
through an API route — the phone shouldn't push a 4MB image through a server
hop.

Two objects per item, both generated client-side on a canvas before upload:

- **full** — longest edge capped at 1600px, WebP quality 80
- **thumb** — 400px, WebP quality 70, what the grid loads

Resizing before upload is about the grid, not the upload. A category page
pulling forty 400px thumbnails opens instantly; one pulling forty 5MB originals
does not, on any connection.

### Deletion

`on delete cascade` handles the source rows. Storage objects it does not — they
have to be removed explicitly, or the bucket fills with orphans nothing points
at.

Deleting an item: delete the storage objects first, then the row. That order
means a failure leaves a row with a broken image, which is visible and fixable,
rather than an invisible orphaned file.

There's no undo and no trash. A confirm step on item deletion, none on source
deletion — losing one link is cheap, losing an item and all its links isn't.

Display uses signed URLs, requested in batch for a grid and cached in memory for
the session.

---

## 3. Sync

The honest version: this is a **server-backed app, not an offline-first one**.
Both devices talk to the same Postgres. That's all "sync" needs to mean here,
and building anything more is a large amount of work for one person with two
devices.

What that buys:

- Add an item on the phone, it's on the laptop on next load
- No merge logic, no conflict resolution, no local replica to keep honest
- Last write wins, which is correct when there's only one writer

Three small things make it feel synced rather than merely shared:

1. **Refetch on window focus.** Coming back to a laptop tab after editing on the
   phone shows fresh data. Covers the common case on its own.
2. **Realtime subscription** on `items` and `sources`. Cheap with supabase-js,
   and keeps an open tab live while working across both devices at once.
3. **Draft persistence.** The add-item form keeps its state in `localStorage`
   until the insert succeeds. If a photo upload dies on a bad connection —
   likely, on the phone — nothing typed is lost and the upload can be retried.

### What's not being built

No offline queue, no service worker, no local-first replica, no CRDTs. If the
connection is dead, the app doesn't work. Accepted.

`updated_at` is maintained by a trigger on both tables anyway. It costs nothing
now and is the first thing any future conflict handling would need.

---

## 4. Backup

Supabase's own backup coverage depends on the plan and isn't something to lean
on as the only copy of months of sourcing work. One deleted-by-accident
collection shouldn't be unrecoverable.

A script, `scripts/backup.ts`, run manually:

- dumps `items`, `sources`, `collections`, `categories` to a timestamped JSON
  file
- downloads every referenced storage object alongside it
- writes to a local folder outside the repo

Run it before anything schema-related and otherwise whenever it occurs to me.
Not automated, not a cron job — a script I can run in ten seconds and a habit
is more reliable here than infrastructure I'd have to maintain.

A matching `scripts/restore.ts` is worth writing at the same time. A backup
that's never been restored isn't known to work.

---

## 5. Screens

### Feed
Grid of collections. Straight through to categories.

### Category view
Grid of item cards. The main screen — most time is spent here.

Each card shows: photo, title, and a summary line rolled up from its sources:

```
from ¥27 · 3 links · 14 colors
```

Price shown is the **top-ranked source's** price, not the minimum. My preferred
option isn't always the cheapest, and the card should reflect what I'd actually
pay.

Controls: filter (type, collection, liked, wanted, has-ranked-source, price
range, color) and a grid/list toggle. Filtering by color checks whether *any*
source carries it. Filtering by price uses the item's top-ranked price.

Roll-ups come from a Postgres view so the grid is one query, not N+1:

```sql
create view item_cards as
select i.*,
       (select price from sources s where s.item_id = i.id
         order by rank nulls last, price limit 1) as lead_price,
       (select count(*) from sources s where s.item_id = i.id) as source_count,
       (select count(distinct c) from sources s,
         unnest(s.colors) c where s.item_id = i.id) as color_count
from items i;
```

### Item view
Photo large. Title, type, brand, Like / Want checkboxes, notes.

Sources listed underneath, **sorted by rank, unranked falling to the bottom
ordered by price**. Each row: seller name, price, color/size counts, reason
tags, link out. Rank shown as a small badge.

Adding a source is one action — no separate "add additional link" flow. Rank is
set by dragging rows or picking a number.

### Add item
Photo first, since that's the anchor. Must accept:

- **paste from clipboard** (Ctrl/Cmd+V of a copied or screenshotted image)
- drag and drop
- file picker
- camera roll on phone

Paste is the primary path — most images come from copying directly out of a
listing page. Then title, type, brand, collection, category. Then the first
source.

### Search
Across item titles, types, brands, seller names and notes. Postgres `ilike`
across the columns is enough at this scale; full-text search is unnecessary for
a few hundred rows. Results open the item view directly.

---

## 6. Look and feel

Image-forward and quiet. The garments are the content; the interface should
stay out of their way. No gradients, no shadows, no rounded-everything.

**Palette**

```
--paper     #FAF9F7    background
--card      #FFFFFF
--ink       #1A1917    primary text
--muted     #6B6764    secondary text
--line      #E3E0DA    borders, 1px
--accent    #8B4A2B    rank badges, active states only
```

**Type**

- UI: Inter — 14px body, 13px meta, tight tracking
- Headings: Instrument Serif — collection and item titles only, nothing smaller
- Prices and counts: tabular numerals

**Structure**

- Cards defined by a 1px border, never a shadow. 2px radius, not 12px.
- Generous whitespace, tight text blocks.
- Photos fill their frame edge to edge with no internal padding, 4:5 ratio.
- Rank badge: small filled square, accent, tabular number. Unranked sources get
  no badge at all rather than a grey one.
- One accent colour, used sparingly. If everything is highlighted, nothing is.

Phone layout matters — a lot of sourcing happens away from the desk. Two-column
grid on mobile, four on desktop.

---

## 7. Stack

- Next.js (App Router) + TypeScript
- Supabase — Postgres, Storage, Auth
- `@supabase/supabase-js` with the SSR helpers for session handling
- Tailwind
- Deployed on Vercel

Migrations as SQL files in `supabase/migrations`, applied with the Supabase
CLI. Not through the dashboard SQL editor — the schema should be reproducible
and in version control.

`.env.local`: project URL and anon key. The service role key is never used in
this app and shouldn't be in the repo at all; every query runs as the logged-in
user through RLS.

---

## 8. Build order

1. Supabase project, schema migration, RLS policies, the single account.
   Verify the policies actually block an unauthenticated client before moving
   on.
2. Auth: login screen, session persistence, redirect on expiry.
3. Add item flow — paste-to-upload with client-side resize, working on desktop
   and phone.
4. Category grid, `item_cards` view, rolled-up summary line.
5. Item view with sources, ranking, reason tags.
6. Deletion — item and source, including storage cleanup.
7. `scripts/backup.ts` and `scripts/restore.ts`. Before there's data worth
   losing, not after.
8. Filters and view toggle.
9. Search.
10. Focus-refetch, realtime subscriptions, draft persistence.
11. Visual pass against the tokens above.

Seed with 10–15 real items from what I've already found, so the layouts get
tested against real data rather than lorem ipsum.

---

## 9. Deliberately not building

- Multi-user, sharing, comments
- Supplier profiles or ratings
- Order tracking, invoices, production status
- Offline mode
- Per-color pricing within a single link. If a listing prices one colour
  differently, it goes in `notes`. If that turns out to be common, a variant
  table under `sources` is the fix — but not until it's actually common.
- Any kind of scoring beyond ordinal rank
