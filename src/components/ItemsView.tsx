"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ItemGrid } from "@/components/ItemGrid";
import { CatalogNav } from "@/components/CatalogNav";
import Link from "next/link";
import {
  useCatalog,
  patchItemLocal,
  removeItemLocal,
  refreshCatalog,
} from "@/lib/catalogStore";
import { createClient } from "@/lib/supabase/client";
import {
  deleteItemFully,
  deleteCollection,
  renameCollection,
} from "@/lib/catalog";
import { getSignedUrls } from "@/lib/signedUrls";
import type { ItemCard } from "@/lib/types";

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

type SortKey =
  | "newest"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "links"
  | "title";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "price-asc", label: "Price ↑" },
  { key: "price-desc", label: "Price ↓" },
  { key: "links", label: "Most links" },
  { key: "title", label: "Title A–Z" },
];

function sortItems(items: ItemCard[], key: SortKey): ItemCard[] {
  const out = [...items];
  const price = (i: ItemCard) => i.lead_price ?? null;
  switch (key) {
    case "newest":
      return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "oldest":
      return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "price-asc":
      return out.sort(
        (a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity),
      );
    case "price-desc":
      return out.sort(
        (a, b) => (price(b) ?? -Infinity) - (price(a) ?? -Infinity),
      );
    case "links":
      return out.sort((a, b) => b.source_count - a.source_count);
    case "title":
      return out.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export function ItemsView({ scope }: { scope: Scope }) {
  const router = useRouter();
  const [filters, setFilters] = useState<FilterState>({
    ...emptyFilters,
    collection: scope.kind === "category" ? (scope.collection ?? "") : "",
  });
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<SortKey>("newest");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // Category-only: whether to include items that are filed in a collection.
  const [includeFiled, setIncludeFiled] = useState(true);
  // Collection scope: inline rename + busy state for collection actions.
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState("");
  const [collBusy, setCollBusy] = useState(false);

  // One shared, cached copy of the whole catalog. Switching scope filters it in
  // memory — no network round-trip per view.
  const { data, loading, error, refetch } = useCatalog();

  // The items belonging to this scope (feed / collection / category / etc.).
  const scoped = useMemo(() => {
    if (!data) return [] as ItemCard[];
    switch (scope.kind) {
      case "unfiled":
        return data.items.filter((i) => i.collection_id == null);
      case "all":
        return data.items;
      case "wanted":
        return data.items.filter((i) => i.wanted);
      case "liked":
        return data.items.filter((i) => i.liked);
      case "collection":
        return data.items.filter((i) => i.collection_id === scope.id);
      case "category":
        return data.items.filter((i) => i.category_id === scope.id);
    }
  }, [data, scope]);

  const { title, kicker } = useMemo(() => {
    switch (scope.kind) {
      case "unfiled":
        return { title: "Your library", kicker: "Not in a collection" };
      case "all":
        return { title: "All items", kicker: "Everything" };
      case "wanted":
        return { title: "Wanted", kicker: "Shortlist" };
      case "liked":
        return { title: "Liked", kicker: "Shortlist" };
      case "collection":
        return {
          title:
            data?.collections.find((c) => c.id === scope.id)?.name ??
            "Collection",
          kicker: "Collection",
        };
      case "category":
        return {
          title:
            data?.categories.find((c) => c.id === scope.id)?.name ?? "Category",
          kicker: "Category",
        };
    }
  }, [scope, data]);

  // Distinct types + colors present in this scope, for the dropdowns.
  const { types, colors } = useMemo(() => {
    const t = new Set<string>();
    const c = new Set<string>();
    const bitsFor = data?.sourcesByItem ?? {};
    for (const item of scoped) {
      if (item.type) t.add(item.type);
      for (const s of bitsFor[item.id] ?? [])
        for (const col of s.colors) c.add(col);
    }
    return {
      types: Array.from(t).sort(),
      colors: Array.from(c).sort((a, b) => a.localeCompare(b)),
    };
  }, [scoped, data]);

  const showCollectionFilter =
    scope.kind === "all" ||
    scope.kind === "wanted" ||
    scope.kind === "liked" ||
    scope.kind === "category";

  const filtered = useMemo(() => {
    if (!data) return [];
    const min = filters.priceMin.trim() === "" ? null : Number(filters.priceMin);
    const max = filters.priceMax.trim() === "" ? null : Number(filters.priceMax);
    return scoped.filter((item) => {
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
  }, [data, scoped, filters, includeFiled, scope.kind, showCollectionFilter]);

  const sorted = useMemo(() => sortItems(filtered, sort), [filtered, sort]);

  useEffect(() => {
    if (sorted.length === 0) return;
    const supabase = createClient();
    getSignedUrls(
      supabase,
      sorted.map((i) => i.thumb_path),
    )
      .then(setThumbs)
      .catch(() => {});
  }, [sorted]);

  // Quick Like/Want toggle straight from a card. Optimistic: flip the cached
  // item immediately, then persist.
  async function toggle(item: ItemCard, field: "liked" | "wanted", next: boolean) {
    patchItemLocal(item.id, { [field]: next });
    const supabase = createClient();
    const { error } = await supabase
      .from("items")
      .update({ [field]: next })
      .eq("id", item.id);
    if (error) refetch(); // reload the truth if the write failed
  }

  // Delete an item (and its links + photos) straight from the grid.
  async function remove(item: ItemCard) {
    if (
      !confirm(
        `Delete “${item.title}” and all its links? This can’t be undone.`,
      )
    )
      return;
    try {
      await deleteItemFully(createClient(), item);
      removeItemLocal(item.id); // drop from the grid immediately
    } catch (e) {
      alert(`Couldn’t delete: ${(e as Error).message}`);
    }
  }

  // Rename the collection currently in scope.
  async function saveRename() {
    if (scope.kind !== "collection") return;
    const next = rename.trim();
    if (!next) return;
    setCollBusy(true);
    try {
      await renameCollection(createClient(), scope.id, next);
      setRenaming(false);
      refetch();
    } catch (e) {
      alert(`Couldn’t rename: ${(e as Error).message}`);
    } finally {
      setCollBusy(false);
    }
  }

  // Delete the collection in scope. Items are unfiled (returned to the feed),
  // not deleted.
  async function removeCollection() {
    if (scope.kind !== "collection") return;
    const n = scoped.length;
    if (
      !confirm(
        `Delete this collection?\n\n` +
          (n > 0
            ? `Its ${n} item${n === 1 ? "" : "s"} will return to your main feed — they won’t be deleted.`
            : `It’s empty, so nothing else changes.`),
      )
    )
      return;
    setCollBusy(true);
    try {
      await deleteCollection(createClient(), scope.id);
      refreshCatalog();
      router.replace("/collections");
    } catch (e) {
      alert(`Couldn’t delete collection: ${(e as Error).message}`);
      setCollBusy(false);
    }
  }

  return (
    <div>
      <CatalogNav />

      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
            <span className="text-meta uppercase tracking-[0.2em] text-muted">
              {kicker}
            </span>
          </div>
          {scope.kind === "collection" && renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="input max-w-xs font-serif text-3xl"
              />
              <button
                onClick={saveRename}
                disabled={collBusy}
                className="btn-accent disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setRenaming(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="truncate font-serif text-4xl leading-tight">
              {data ? title : "…"}
            </h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {scope.kind === "collection" && data && !renaming && (
            <div className="flex items-center gap-1 text-meta">
              <button
                onClick={() => {
                  setRename(title);
                  setRenaming(true);
                }}
                className="rounded-pill border border-line bg-card/60 px-3 py-1.5 text-muted transition-colors hover:border-accent/60 hover:text-ink"
              >
                Rename
              </button>
              <button
                onClick={removeCollection}
                disabled={collBusy}
                className="rounded-pill border border-line bg-card/60 px-3 py-1.5 text-muted transition-colors hover:border-accent hover:text-accentSoft disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
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
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2 text-meta">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-card border border-line bg-card px-2 py-1"
          title="Sort"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

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
            {filtered.length} of {scoped.length}
          </p>
          <ItemGrid
            items={sorted}
            thumbs={thumbs}
            view={view}
            onToggle={toggle}
            onDelete={remove}
          />
          {scoped.length === 0 && (
            <p className="mt-6 text-meta text-muted">
              {emptyHint(scope)}
            </p>
          )}
        </>
      )}
    </div>
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
