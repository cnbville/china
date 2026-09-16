"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Collection, ItemCard } from "@/lib/types";

// A single shared, in-memory copy of the whole catalog.
//
// This is a small, single-user dataset (a few hundred items at most), so instead
// of a fresh network query every time you switch views — feed → a collection →
// All → Wanted — we load everything ONCE and derive each view by filtering in
// memory. Switching is then instant. A single realtime subscription + focus
// refetch keeps the cache fresh across both devices, and optimistic helpers make
// likes / wants / deletes feel immediate.

export type SourceBit = {
  item_id: string;
  colors: string[];
  rank: number | null;
};

export type CatalogData = {
  items: ItemCard[];
  sourcesByItem: Record<string, SourceBit[]>;
  collections: Collection[];
  categories: Category[];
};

let cache: CatalogData | null = null;
let lastError: string | null = null;
let inFlight: Promise<void> | null = null;
let subscribed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function fetchAll(): Promise<CatalogData> {
  const supabase = createClient();
  const [itemsRes, srcRes, collRes, catRes] = await Promise.all([
    supabase
      .from("item_cards")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("sources").select("item_id, colors, rank"),
    supabase.from("collections").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
  ]);
  if (itemsRes.error) throw itemsRes.error;

  const items = (itemsRes.data ?? []) as ItemCard[];
  const sourcesByItem: Record<string, SourceBit[]> = {};
  for (const s of (srcRes.data ?? []) as SourceBit[]) {
    (sourcesByItem[s.item_id] ??= []).push(s);
  }

  return {
    items,
    sourcesByItem,
    collections: (collRes.data ?? []) as Collection[],
    categories: (catRes.data ?? []) as Category[],
  };
}

/** Reload the whole catalog. Concurrent callers share one in-flight fetch. */
export function refreshCatalog(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      cache = await fetchAll();
      lastError = null;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Something went wrong";
    } finally {
      inFlight = null;
      notify();
    }
  })();
  return inFlight;
}

// Set up the live-update wiring exactly once for the tab.
function ensureSubscription() {
  if (subscribed) return;
  subscribed = true;

  const supabase = createClient();
  supabase
    .channel("catalog-store")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "items" },
      () => refreshCatalog(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sources" },
      () => refreshCatalog(),
    )
    .subscribe();

  window.addEventListener("focus", () => refreshCatalog());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshCatalog();
  });
}

/**
 * Subscribe a component to the shared catalog. Returns the cached data
 * immediately when present (instant view switches) and revalidates in the
 * background.
 */
export function useCatalog() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    listeners.add(onChange);
    ensureSubscription();
    onChange(); // render whatever is already cached, instantly
    refreshCatalog(); // then revalidate in the background (deduped)
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return {
    data: cache,
    loading: cache == null && lastError == null,
    error: lastError,
    refetch: refreshCatalog,
  };
}

/** Optimistically patch one item in the cache (e.g. a like/want toggle). */
export function patchItemLocal(id: string, patch: Partial<ItemCard>) {
  if (!cache) return;
  cache = {
    ...cache,
    items: cache.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  };
  notify();
}

/** Optimistically drop one item from the cache (e.g. after a delete). */
export function removeItemLocal(id: string) {
  if (!cache) return;
  const nextSources = { ...cache.sourcesByItem };
  delete nextSources[id];
  cache = {
    ...cache,
    items: cache.items.filter((i) => i.id !== id),
    sourcesByItem: nextSources,
  };
  notify();
}
