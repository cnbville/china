"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { ItemGrid } from "@/components/ItemGrid";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrls";
import type { ItemCard } from "@/lib/types";

// Search across item titles, types, brands, seller names and notes (plan
// section 5). Postgres ilike is enough at this scale; full-text is unnecessary
// for a few hundred rows. Results open the item view directly.

// PostgREST's .or() uses commas and parentheses as syntax, so strip them from
// the user's term before interpolating.
function sanitize(q: string): string {
  return q.replace(/[,()*]/g, " ").trim();
}

async function search(q: string): Promise<ItemCard[]> {
  const term = sanitize(q);
  if (!term) return [];
  const supabase = createClient();
  const like = `%${term}%`;

  const [itemsRes, sourcesRes] = await Promise.all([
    supabase
      .from("item_cards")
      .select("*")
      .or(
        `title.ilike.${like},type.ilike.${like},brand.ilike.${like},notes.ilike.${like}`,
      ),
    supabase
      .from("sources")
      .select("item_id")
      .or(`seller_name.ilike.${like},notes.ilike.${like}`),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (sourcesRes.error) throw sourcesRes.error;

  const byId = new Map<string, ItemCard>();
  for (const item of (itemsRes.data ?? []) as ItemCard[]) byId.set(item.id, item);

  // Items matched only via a source need a second fetch.
  const extraIds = Array.from(
    new Set(
      (sourcesRes.data ?? [])
        .map((r) => r.item_id as string)
        .filter((id) => !byId.has(id)),
    ),
  );
  if (extraIds.length > 0) {
    const extra = await supabase
      .from("item_cards")
      .select("*")
      .in("id", extraIds);
    if (extra.error) throw extra.error;
    for (const item of (extra.data ?? []) as ItemCard[]) byId.set(item.id, item);
  }

  return Array.from(byId.values());
}

function SearchInner() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ItemCard[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Debounce so we don't fire a query per keystroke.
  useEffect(() => {
    if (sanitize(q) === "") {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const found = await search(q);
        setResults(found);
        setSearched(true);
        setError(null);
        const supabase = createClient();
        const map = await getSignedUrls(
          supabase,
          found.map((i) => i.thumb_path),
        );
        setThumbs(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-serif text-3xl">Search</h1>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="title, type, brand, seller, notes…"
          className="input mt-4"
        />

        {error && <p className="mt-4 text-meta text-accent">{error}</p>}

        {searched && (
          <>
            <p className="mt-4 text-meta text-muted tnum">
              {results.length} {results.length === 1 ? "result" : "results"}
            </p>
            <ItemGrid items={results} thumbs={thumbs} view="list" />
          </>
        )}

        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
