"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCatalog } from "@/lib/catalogStore";
import { CollectionNotepad } from "@/components/CollectionNotepad";

// Left rail: browse straight to a collection or category from anywhere.
export function LeftRail() {
  const { data: catalog } = useCatalog();
  const data = useMemo(() => {
    if (!catalog) return null;
    const counts: Record<string, number> = {};
    for (const i of catalog.items)
      if (i.collection_id)
        counts[i.collection_id] = (counts[i.collection_id] ?? 0) + 1;
    return {
      collections: catalog.collections.map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      })),
      categories: catalog.categories,
    };
  }, [catalog]);

  return (
    <div className="sticky top-20 space-y-6">
      <section>
        <RailLabel>Collections</RailLabel>
        {data && data.collections.length === 0 && (
          <p className="text-meta text-muted">None yet</p>
        )}
        <div className="space-y-0.5">
          {(data?.collections ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/collections?id=${c.id}`}
              className="flex items-center justify-between rounded-card px-2 py-1.5 text-body text-muted transition-colors hover:bg-surface2 hover:text-ink"
            >
              <span className="truncate">{c.name}</span>
              <span className="ml-2 shrink-0 text-meta text-muted tnum">
                {c.count}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <RailLabel>Categories</RailLabel>
        <div className="flex flex-wrap gap-1.5">
          {(data?.categories ?? []).map((cat) => (
            <Link
              key={cat.id}
              href={`/categories?id=${cat.id}`}
              className="rounded-pill border border-line bg-card/60 px-2.5 py-1 text-meta text-muted transition-colors hover:border-accent/60 hover:text-ink"
            >
              {cat.name}
            </Link>
          ))}
          {data && data.categories.length === 0 && (
            <p className="text-meta text-muted">None yet</p>
          )}
        </div>
      </section>

      <section>
        <CollectionNotepad />
      </section>
    </div>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-3 w-1 rounded-pill bg-accent shadow-glow" />
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
        {children}
      </span>
    </div>
  );
}
