"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { Category, Collection } from "@/lib/types";

type FeedData = {
  collections: Collection[];
  categories: Category[];
  countsByCollection: Record<string, number>;
};

async function fetchFeed(): Promise<FeedData> {
  const supabase = createClient();
  const [collectionsRes, categoriesRes, itemsRes] = await Promise.all([
    supabase.from("collections").select("*").order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("items").select("collection_id"),
  ]);

  if (collectionsRes.error) throw collectionsRes.error;
  if (categoriesRes.error) throw categoriesRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const countsByCollection: Record<string, number> = {};
  for (const row of itemsRes.data ?? []) {
    if (row.collection_id) {
      countsByCollection[row.collection_id] =
        (countsByCollection[row.collection_id] ?? 0) + 1;
    }
  }

  return {
    collections: collectionsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    countsByCollection,
  };
}

export default function FeedPage() {
  const { data, loading, error } = useLiveData(fetchFeed);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && <p className="text-meta text-accent">{error}</p>}
        {loading && !data && <p className="text-meta text-muted">Loading…</p>}

        {data && (
          <div className="animate-fade-up">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3.5 w-1.5 rounded-pill bg-accent shadow-glow" />
              <span className="text-meta uppercase tracking-[0.2em] text-muted">
                Collections
              </span>
            </div>
            <h1 className="font-serif text-4xl leading-tight md:text-5xl">
              Your library
            </h1>

            {data.collections.length === 0 ? (
              <p className="mt-4 text-body text-muted">
                No collections yet. Add an item and give it a collection.
              </p>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {data.collections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections?id=${c.id}`}
                    className="group relative overflow-hidden rounded-card border border-line bg-card p-5 transition-all hover:border-accent/60 hover:shadow-lift"
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="font-serif text-2xl leading-tight">
                      {c.name}
                    </div>
                    <div className="mt-3 text-meta text-muted tnum">
                      <span className="text-accentSoft">
                        {data.countsByCollection[c.id] ?? 0}
                      </span>{" "}
                      items
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <h2 className="mt-14 text-meta uppercase tracking-[0.2em] text-muted">
              Browse by category
            </h2>
            {data.categories.length === 0 ? (
              <p className="mt-3 text-meta text-muted">No categories yet.</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories?id=${cat.id}`}
                    className="rounded-pill border border-line bg-card/60 px-4 py-1.5 text-meta text-muted transition-colors hover:border-accent/60 hover:text-ink"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
