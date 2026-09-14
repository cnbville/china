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
          <>
            <h1 className="font-serif text-3xl">Collections</h1>
            {data.collections.length === 0 ? (
              <p className="mt-3 text-meta text-muted">
                No collections yet. Add an item and give it a collection.
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {data.collections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections/${c.id}`}
                    className="rounded-card border border-line bg-card p-4 hover:border-ink"
                  >
                    <div className="font-serif text-xl leading-tight">
                      {c.name}
                    </div>
                    <div className="mt-2 text-meta text-muted tnum">
                      {data.countsByCollection[c.id] ?? 0} items
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <h2 className="mt-12 text-meta uppercase tracking-widest text-muted">
              Browse by category
            </h2>
            {data.categories.length === 0 ? (
              <p className="mt-3 text-meta text-muted">No categories yet.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {data.categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/categories/${cat.id}`}
                    className="rounded-card border border-line bg-card px-3 py-1.5 text-meta hover:border-ink"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
