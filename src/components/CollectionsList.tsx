"use client";

import Link from "next/link";
import { CatalogNav } from "@/components/CatalogNav";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { Collection } from "@/lib/types";

// Dedicated Collections page: your chosen sets ("Winter", "School"). Opening one
// shows just that collection's items.
type Data = { collections: (Collection & { count: number })[] };

export function CollectionsList() {
  const { data, loading, error } = useLiveData<Data>(async () => {
    const supabase = createClient();
    const [collRes, itemsRes] = await Promise.all([
      supabase.from("collections").select("*").order("name"),
      supabase.from("items").select("collection_id"),
    ]);
    if (collRes.error) throw collRes.error;
    if (itemsRes.error) throw itemsRes.error;

    const counts: Record<string, number> = {};
    for (const row of itemsRes.data ?? [])
      if (row.collection_id)
        counts[row.collection_id] = (counts[row.collection_id] ?? 0) + 1;

    return {
      collections: ((collRes.data ?? []) as Collection[]).map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      })),
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CatalogNav />

      <div className="mb-1 mt-6 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Sets
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Collections</h1>
      <p className="mt-2 text-meta text-muted">
        Group pieces into sets like “Winter” or “School”. Anything filed into a
        collection leaves the main feed and lives here instead.
      </p>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && data.collections.length === 0 && (
        <p className="mt-6 text-meta text-muted">
          No collections yet. Give an item a collection name when adding or
          editing it, and it’ll appear here.
        </p>
      )}

      {data && data.collections.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.collections.map((c) => (
            <Link
              key={c.id}
              href={`/collections?id=${c.id}`}
              className="group relative overflow-hidden rounded-card border border-line bg-card p-5 transition-all hover:border-accent/60 hover:shadow-lift"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="font-serif text-2xl leading-tight">{c.name}</div>
              <div className="mt-3 text-meta text-muted tnum">
                <span className="text-accentSoft">{c.count}</span> items
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
