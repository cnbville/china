"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Sync, the honest version (plan section 3): this is a server-backed app. Two
// small things here make it feel synced rather than merely shared —
//  1. refetch on window focus
//  2. a realtime subscription on items + sources
// (Draft persistence, the third, lives in the add-item form.)

type Fetcher<T> = () => Promise<T>;

export function useLiveData<T>(fetcher: Fetcher<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest fetcher without making the effects depend on its identity.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    try {
      const next = await fetcherRef.current();
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();

    // 1. Refetch when the tab regains focus / becomes visible.
    const onFocus = () => refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    // 2. Realtime: any change to items or sources refetches. Cheap, and keeps an
    //    open tab live when working across both devices at once.
    const supabase = createClient();
    const channel = supabase
      .channel("catalog-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        () => refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sources" },
        () => refetch(),
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return { data, loading, error, refetch };
}
