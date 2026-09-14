"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

type Data = {
  collectionName: string;
  categories: (Category & { count: number })[];
};

export function CollectionCategories({ collectionId }: { collectionId: string }) {
  const { data, loading, error } = useLiveData<Data>(async () => {
    const supabase = createClient();
    const [collRes, itemsRes, catsRes] = await Promise.all([
      supabase.from("collections").select("name").eq("id", collectionId).single(),
      supabase
        .from("items")
        .select("category_id")
        .eq("collection_id", collectionId),
      supabase.from("categories").select("*").order("name"),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const counts: Record<string, number> = {};
    for (const row of itemsRes.data ?? []) {
      if (row.category_id)
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
    }

    const categories = ((catsRes.data ?? []) as Category[])
      .map((c) => ({ ...c, count: counts[c.id] ?? 0 }))
      .filter((c) => c.count > 0);

    return {
      collectionName: collRes.data?.name ?? "Collection",
      categories,
    };
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-serif text-3xl">{data?.collectionName ?? "…"}</h1>

        {error && <p className="mt-4 text-meta text-accent">{error}</p>}
        {loading && !data && (
          <p className="mt-6 text-meta text-muted">Loading…</p>
        )}

        {data && data.categories.length === 0 && (
          <p className="mt-6 text-meta text-muted">
            No items in this collection yet.
          </p>
        )}

        {data && data.categories.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {data.categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categories?id=${cat.id}&collection=${collectionId}`}
                className="rounded-card border border-line bg-card p-4 hover:border-ink"
              >
                <div className="font-serif text-xl leading-tight">{cat.name}</div>
                <div className="mt-2 text-meta text-muted tnum">
                  {cat.count} items
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← All collections
          </Link>
        </p>
      </main>
    </>
  );
}
