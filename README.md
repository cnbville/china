# Sourcing Catalog

A private catalog for tracking garments under consideration for a clothing line.
Single user, two devices. Factory links live in one browsable library, where each
garment (**item**) holds every link (**source**) found for it, ranked by which
one you'd actually order from — and the same library is on both devices.

Built to the spec in `PLAN.md` (the build plan). This README covers running it.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Supabase** — Postgres, Storage, Auth
- **@supabase/supabase-js** + **@supabase/ssr** for session handling
- **Tailwind**
- Deploy target: **Vercel**

## One-time setup

Some of this happens in the Supabase dashboard/CLI and can't be scripted from the
repo — the commands are all here.

### 1. Create the Supabase project

Create a project at [supabase.com](https://supabase.com). Note the project ref,
the project URL, and the **anon** key (Project Settings → API).

### 2. Disable sign-ups

Authentication → Providers → Email: turn **off** "Enable sign-ups". This is what
keeps the data private — only the single account you create can log in.
(`supabase/config.toml` also encodes this; `supabase config push` applies it.)

### 3. Apply the schema

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push            # applies everything in supabase/migrations
```

Migrations (in order):

| File | What it does |
|---|---|
| `0001_init.sql` | Tables, indexes, `unique (item_id, url)` on sources |
| `0002_rls.sql` | RLS **on** for every table, authenticated-only policies |
| `0003_triggers_and_constraints.sql` | `updated_at` triggers; reasons-required-when-ranked check |
| `0004_item_cards_view.sql` | `item_cards` roll-up view for the grid |
| `0005_storage.sql` | Private `photos` bucket + storage policies |
| `0006_realtime.sql` | Adds items + sources to the realtime publication |

**Verify RLS blocks an anonymous client before going further** (plan section 8,
step 1). With the anon key, an unauthenticated select must return no rows:

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/items?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# expected: []  (RLS denies the anon role)
```

### 4. Create the single account

Authentication → Users → **Add user** → create your email + password. This is the
only account; there is no sign-up flow in the app.

### 5. (Optional) Seed example data

```bash
supabase db reset     # re-runs migrations, then supabase/seed.sql
```

`supabase/seed.sql` holds ~12 example items so the layouts have realistic data.
Replace it with your own real items. (Seed rows have no photos — add those
through the app.)

### 6. Environment + run

```bash
cp .env.local.example .env.local   # fill in URL + anon key
npm install
npm run dev                        # http://localhost:3000
```

## Backups

Supabase's own backups depend on your plan; don't lean on them as the only copy.
Two manual scripts (plan section 4):

```bash
npm run backup     # dumps the 4 tables to JSON + downloads all photos
npm run restore    # restores the most recent backup
npm run restore -- /path/to/a/specific/backup
```

Both need the **service role** key and a `BACKUP_DIR` (see `.env.local.example`).
The service role key bypasses RLS, so keep it out of the app's env — export it in
your shell before running, or keep it only in `.env.local` (gitignored). Run a
backup before anything schema-related. A restore you've never tested isn't known
to work — run one once.

## Deploy (GitHub Pages)

The app is built as a **static export** (`output: "export"` in `next.config.js`)
so it can be hosted on GitHub Pages with no server — every screen talks to
Supabase directly from the browser, and auth + routing are client-side.

Deployment is automated by `.github/workflows/deploy.yml`: on every push to
`main` it builds the static site and publishes it to Pages. One-time setup:

1. Make the repository **public** (Pages is free only on public repos).
2. Repo **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site lands at
   `https://<user>.github.io/china/` — the `/china` base path is set in
   `next.config.js`; rename it if you rename the repo.

The public Supabase URL + publishable key are set as build-time env in the
workflow. The service role key is **not** used by the app and must never be added.

> Alternative: **Vercel** works too and doesn't require the repo to be public —
> import the repo and set the two `NEXT_PUBLIC_*` env vars. If you go that route,
> remove `output: "export"`, `basePath`, and `assetPrefix` from `next.config.js`
> to get server rendering back.

## Where things live

```
supabase/migrations/   SQL schema, RLS, view, storage (version-controlled)
supabase/seed.sql      example data
scripts/               backup.ts / restore.ts (run manually, service role key)
src/app/               routes: / (feed), /login, /categories/[id],
                       /collections/[id], /items/[id], /items/new, /search
src/components/        Header, PhotoInput, SourceFields, ItemGrid,
                       CategoryBrowser, CollectionCategories, ItemView, …
src/lib/               supabase clients, image resize, signed-url cache,
                       source validation/sort, live-data hook, constants, types
src/middleware.ts      auth gate + session refresh
```

## Notes on the model (from the plan)

- **Item vs source.** Everything that varies between suppliers (price, colours,
  sizes, MOQ) lives on `sources`, never on `items`. Price is **CNY only**.
- **Rank is ordinal**, 1 = preferred, within an item. `reasons` is a fixed tag
  set, required whenever a rank is set (enforced in the DB and the UI).
- **No supplier table** — `seller_name` is a plain label, not an entity.
- **RLS is the security boundary.** The anon key ships in the client bundle;
  every query runs as the logged-in user. There are no `owner_id` columns because
  the one authenticated user *is* the owner.
- **Server-backed, not offline-first.** Sync = both devices talking to the same
  Postgres, plus refetch-on-focus, a realtime subscription, and localStorage
  draft persistence on the add-item form. No offline queue, no service worker.

See section 9 of the build plan for what is deliberately **not** built.
```
