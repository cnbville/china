"use client";

import { useEffect, useMemo, useState } from "react";
import { ItemGrid } from "@/components/ItemGrid";
import { CatalogNav } from "@/components/CatalogNav";
import Link from "next/link";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrls";
import type { Category, Collection, ItemCard } from "@/lib/types";

// One reusable "grid of items" screen. Every browse route points at it with a
// different scope, so the feed, a collection, a category, All / Wanted / Liked
// all share the same filters, layout and behaviour.
export type Scope =
  | { kind: "unfiled" } // main feed: items NOT in a collection
  | { kind: "all" }
  | { kind: "wanted" }
  | { kind: "liked" }
  | { kind: "collection"; id: string }
  | { kind: "category"; id: string; collection?: string };

type SourceBit = { item_id: string; colors: string[]; rank: number | null };

type Data = {
  title: string;
  kicker: string;
  items: ItemCard[];
  sourcesByItem: Record<string, SourceBit[]>;
  collections: Collection[];
  categories: Category[];
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

export function ItemsView({ scope }: { scope: Scope }) {
  const [filters, setFilters] = useState<FilterState>({
    ...emptyFilters,
    collection: scope.kind === "category" ? (scope.collection ?? "") : "",
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Category-only: whether to include items that are filed in a collection.
  const [includeFiled, setIncludeFiled] = useState(true);

  const { data, loading, error } = useLiveData<Data>(async () => {
    const supabase = createClient();

    let q = supabase.from("item_cards").select("*");
    let title = "";
    let kicker = "";

    switch (scope.kind) {
      case "unfiled":
        q = q.is("collection_id", null);
        title = "Your library";
        kicker = "Not in a collection";
        break;
      case "all":
        title = "All items";
        kicker = "Everything";
        break;
      case "wanted":
        q = q.eq("wanted", true);
        title = "Wanted";
        kicker = "Shortlist";
        break;
      case "liked":
        q = q.eq("liked", true);
        title = "Liked";
        kicker = "Shortlist";
        break;
      case "collection":
        q = q.eq("collection_id", scope.id);
        kicker = "Collection";
        break;
      case "category":
        q = q.eq("category_id", scope.id);
        kicker = "Category";
        break;
    }

    const [itemsRes, collectionsRes, categoriesRes] = await Promise.all([
      q.order("created_at", { ascending: false }),
      supabase.from("collections").select("*").order("name"),
      supabase.from("categories").select("*").order("name"),
    ]);
    if (itemsRes.error) throw itemsRes.error;

    const items = (itemsRes.data ?? []) as ItemCard[];
    const collections = (collectionsRes.data ?? []) as Collection[];
    const categories = (categoriesRes.data ?? []) as Category[];

    // Resolve the display name for collection / category scopes.
    if (scope.kind === "collection") {
      const { data: c } = await supabase
        .from("collections")
        .select("name")
        .eq("id", scope.id)
        .single();
      title = c?.name ?? "Collection";
    } else if (scope.kind === "category") {
      const { data: c } = await supabase
        .from("categories")
        .select("name")
        .eq("id", scope.id)
        .single();
      title = c?.name ?? "Category";
    }

    let sourcesByItem: Record<string, SourceBit[]> = {};
    const ids = items.map((i) => i.id);
    if (ids.length > 0) {
      const srcRes = await supabase
        .from("sources")
        .select("item_id, colors, rank")
        .in("item_id", ids);
      if (srcRes.error) throw srcRes.error;
      for (const s of (srcRes.data ?? []) as SourceBit[]) {
        (sourcesByItem[s.item_id] ??= []).push(s);
      }
    }

    return { title, kicker, items, sourcesByItem, collections, categories };
  });

  // Distinct types + colors present, for the dropdowns.
  const { types, colors } = useMemo(() => {
    const t = new Set<string>();
    const c = new Set<string>();
    for (const item of data?.items ?? []) if (item.type) t.add(item.type);
    for (const bits of Object.values(data?.sourcesByItem ?? {}))
      for (const s of bits) for (const col of s.colors) c.add(col);
    return {
      types: Array.from(t).sort(),
      colors: Array.from(c).sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const showCollectionFilter =
    scope.kind === "all" ||
    scope.kind === "wanted" ||
    scope.kind === "liked" ||
    scope.kind === "category";

  const filtered = useMemo(() => {
    if (!data) return [];
    const min = filters.priceMin.trim() === "" ? null : Number(filters.priceMin);
    const max = filters.priceMax.trim() === "" ? null : Number(filters.priceMax);
    return data.items.filter((item) => {
      if (scope.kind === "category" && !includeFiled && item.collection_id)
        return false;
      if (filters.type && item.type !== filters.type) return false;
      if (
        showCollectionFilter &&
        filters.collection &&
        item.collection_id !== filters.collection
      )
        return false;
      if (filters.liked && !item.liked) return false;
      if (filters.wanted && !item.wanted) return false;

      const bits = data.sourcesByItem[item.id] ?? [];
      if (filters.hasRanked && !bits.some((s) => s.rank != null)) return false;
      if (
        filters.color &&
        !bits.some((s) =>
          s.colors.some((c) => c.toLowerCase() === filters.color.toLowerCase()),
        )
      )
        return false;

      if (min != null || max != null) {
        if (item.lead_price == null) return false;
        if (min != null && item.lead_price < min) return false;
        if (max != null && item.lead_price > max) return false;
      }
      return true;
    });
  }, [data, filters, includeFiled, scope.kind, showCollectionFilter]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const supabase = createClient();
    getSignedUrls(
      supabase,
      filtered.map((i) => i.thumb_path),
    )
      .then(setThumbs)
      .catch(() => {});
  }, [filtered]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <CatalogNav />

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
            <span className="text-meta uppercase tracking-[0.2em] text-muted">
              {data?.kicker ?? ""}
            </span>
          </div>
          <h1 className="font-serif text-4xl leading-tight">
            {data?.title ?? "…"}
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-pill border border-line bg-card/60 p-1 text-meta">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-pill px-3 py-1 capitalize transition-colors " +
                (view === v ? "bg-accent text-white" : "text-muted hover:text-ink")
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
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

        {showCollectionFilter && (
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
        )}

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
          onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
          className="w-20 rounded-card border border-line bg-card px-2 py-1 tnum"
        />
        <input
          inputMode="decimal"
          placeholder="max ¥"
          value={filters.priceMax}
          onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
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

        {/* Category-only: include items filed in collections */}
        {scope.kind === "category" && (
          <Toggle
            label="Filed too"
            on={includeFiled}
            onClick={() => setIncludeFiled((v) => !v)}
          />
        )}
      </div>

      {/* Category entry points on the broad views. */}
      {data &&
        (scope.kind === "unfiled" || scope.kind === "all") &&
        data.categories.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-meta uppercase tracking-[0.2em] text-muted">
              Browse by category
            </div>
            <div className="flex flex-wrap gap-2">
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
          </div>
        )}

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && (
        <>
          <p className="mt-4 text-meta text-muted tnum">
            {filtered.length} of {data.items.length}
          </p>
          <ItemGrid items={filtered} thumbs={thumbs} view={view} />
          {data.items.length === 0 && (
            <p className="mt-6 text-meta text-muted">
              {emptyHint(scope)}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function emptyHint(scope: Scope): string {
  switch (scope.kind) {
    case "unfiled":
      return "Nothing here yet. New items with no collection show up here.";
    case "wanted":
      return "Nothing marked Wanted yet.";
    case "liked":
      return "Nothing marked Liked yet.";
    case "collection":
      return "This collection is empty.";
    case "category":
      return "No items in this category.";
    default:
      return "No items yet.";
  }
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
        "rounded-pill border px-2.5 py-1 transition-colors " +
        (on
          ? "border-accent bg-accent text-white"
          : "border-line text-muted hover:text-ink")
      }
    >
      {label}
    </button>
  );
}
