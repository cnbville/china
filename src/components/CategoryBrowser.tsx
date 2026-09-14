"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { ItemGrid } from "@/components/ItemGrid";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrls";
import type { Collection, ItemCard } from "@/lib/types";

type SourceBit = { item_id: string; colors: string[]; rank: number | null };

type Data = {
  categoryName: string;
  items: ItemCard[];
  sourcesByItem: Record<string, SourceBit[]>;
  collections: Collection[];
};

type FilterState = {
  type: string;
  collection: string;
  liked: boolean;
  wanted: boolean;
  hasRanked: boolean;
  color: string;
  priceMin: string;
  priceMax: string;
};

const emptyFilters: FilterState = {
  type: "",
  collection: "",
  liked: false,
  wanted: false,
  hasRanked: false,
  color: "",
  priceMin: "",
  priceMax: "",
};

export function CategoryBrowser({
  categoryId,
  initialCollection,
}: {
  categoryId: string;
  initialCollection?: string;
}) {
  const [filters, setFilters] = useState<FilterState>({
    ...emptyFilters,
    collection: initialCollection ?? "",
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const { data, loading, error } = useLiveData<Data>(async () => {
    const supabase = createClient();
    const [catRes, itemsRes, collectionsRes] = await Promise.all([
      supabase.from("categories").select("name").eq("id", categoryId).single(),
      supabase
        .from("item_cards")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false }),
      supabase.from("collections").select("*").order("name"),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const items = (itemsRes.data ?? []) as ItemCard[];
    const ids = items.map((i) => i.id);

    let sourcesByItem: Record<string, SourceBit[]> = {};
    if (ids.length > 0) {
      const srcRes = await supabase
        .from("sources")
        .select("item_id, colors, rank")
        .in("item_id", ids);
      if (srcRes.error) throw srcRes.error;
      sourcesByItem = {};
      for (const s of (srcRes.data ?? []) as SourceBit[]) {
        (sourcesByItem[s.item_id] ??= []).push(s);
      }
    }

    return {
      categoryName: catRes.data?.name ?? "Category",
      items,
      sourcesByItem,
      collections: (collectionsRes.data ?? []) as Collection[],
    };
  });

  // Distinct types and colors present, for the filter dropdowns.
  const { types, colors } = useMemo(() => {
    const t = new Set<string>();
    const c = new Set<string>();
    for (const item of data?.items ?? []) if (item.type) t.add(item.type);
    for (const bits of Object.values(data?.sourcesByItem ?? {})) {
      for (const s of bits) for (const col of s.colors) c.add(col);
    }
    return {
      types: Array.from(t).sort(),
      colors: Array.from(c).sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const min = filters.priceMin.trim() === "" ? null : Number(filters.priceMin);
    const max = filters.priceMax.trim() === "" ? null : Number(filters.priceMax);
    return data.items.filter((item) => {
      if (filters.type && item.type !== filters.type) return false;
      if (filters.collection && item.collection_id !== filters.collection)
        return false;
      if (filters.liked && !item.liked) return false;
      if (filters.wanted && !item.wanted) return false;

      const bits = data.sourcesByItem[item.id] ?? [];
      if (filters.hasRanked && !bits.some((s) => s.rank != null)) return false;
      if (
        filters.color &&
        !bits.some((s) =>
          s.colors.some(
            (col) => col.toLowerCase() === filters.color.toLowerCase(),
          ),
        )
      )
        return false;

      // Price filter uses the item's top-ranked price (lead_price).
      if (min != null || max != null) {
        if (item.lead_price == null) return false;
        if (min != null && item.lead_price < min) return false;
        if (max != null && item.lead_price > max) return false;
      }
      return true;
    });
  }, [data, filters]);

  // Batch signed URLs for the visible thumbnails.
  useEffect(() => {
    const paths = filtered.map((i) => i.thumb_path);
    if (paths.length === 0) return;
    const supabase = createClient();
    getSignedUrls(supabase, paths).then(setThumbs).catch(() => {});
  }, [filtered]);

  const activeFilters =
    filters.type ||
    filters.collection ||
    filters.liked ||
    filters.wanted ||
    filters.hasRanked ||
    filters.color ||
    filters.priceMin ||
    filters.priceMax;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
              <span className="text-meta uppercase tracking-[0.2em] text-muted">
                Category
              </span>
            </div>
            <h1 className="font-serif text-4xl leading-tight">
              {data?.categoryName ?? "…"}
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-pill border border-line bg-card/60 p-1 text-meta">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={
                  "rounded-pill px-3 py-1 capitalize transition-colors " +
                  (view === v
                    ? "bg-accent text-white"
                    : "text-muted hover:text-ink")
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-meta">
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className="rounded-card border border-line bg-card px-2 py-1"
          >
            <option value="">Any type</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={filters.collection}
            onChange={(e) =>
              setFilters((f) => ({ ...f, collection: e.target.value }))
            }
            className="rounded-card border border-line bg-card px-2 py-1"
          >
            <option value="">Any collection</option>
            {(data?.collections ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filters.color}
            onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
            className="rounded-card border border-line bg-card px-2 py-1"
          >
            <option value="">Any color</option>
            {colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            inputMode="decimal"
            placeholder="min ¥"
            value={filters.priceMin}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priceMin: e.target.value }))
            }
            className="w-20 rounded-card border border-line bg-card px-2 py-1 tnum"
          />
          <input
            inputMode="decimal"
            placeholder="max ¥"
            value={filters.priceMax}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priceMax: e.target.value }))
            }
            className="w-20 rounded-card border border-line bg-card px-2 py-1 tnum"
          />

          <Toggle
            label="Liked"
            on={filters.liked}
            onClick={() => setFilters((f) => ({ ...f, liked: !f.liked }))}
          />
          <Toggle
            label="Wanted"
            on={filters.wanted}
            onClick={() => setFilters((f) => ({ ...f, wanted: !f.wanted }))}
          />
          <Toggle
            label="Ranked"
            on={filters.hasRanked}
            onClick={() => setFilters((f) => ({ ...f, hasRanked: !f.hasRanked }))}
          />

          {activeFilters && (
            <button
              onClick={() =>
                setFilters({ ...emptyFilters, collection: "" })
              }
              className="text-muted underline hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-meta text-accent">{error}</p>}
        {loading && !data && (
          <p className="mt-6 text-meta text-muted">Loading…</p>
        )}

        {data && (
          <>
            <p className="mt-4 text-meta text-muted tnum">
              {filtered.length} of {data.items.length}
            </p>
            <ItemGrid items={filtered} thumbs={thumbs} view={view} />
          </>
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

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-card border px-2 py-1 " +
        (on
          ? "border-accent bg-accent text-white"
          : "border-line text-muted hover:text-ink")
      }
    >
      {label}
    </button>
  );
}
