import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTOS_BUCKET } from "./constants";

// Signed URLs for private storage objects, requested in batch for a grid and
// cached in memory for the session (plan section 2).
//
// The bucket is private, so every displayed image needs a signed URL. Batching
// avoids one round-trip per thumbnail; caching avoids re-signing on re-render,
// focus-refetch, or realtime updates that don't change the path.

const EXPIRES_IN = 60 * 60; // 1 hour
// Re-sign a little before expiry so a long-open tab never shows a broken image.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();

function live(path: string): string | null {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return hit.url;
  return null;
}

/**
 * Resolve signed URLs for many storage paths at once. Returns a path -> url map.
 * Cached paths are served from memory; only the misses hit the network, in one
 * batched call.
 */
export async function getSignedUrls(
  supabase: SupabaseClient,
  paths: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const wanted = Array.from(
    new Set(paths.filter((p): p is string => !!p)),
  );

  const result: Record<string, string> = {};
  const misses: string[] = [];

  for (const path of wanted) {
    const url = live(path);
    if (url) result[path] = url;
    else misses.push(path);
  }

  if (misses.length > 0) {
    const { data, error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls(misses, EXPIRES_IN);

    if (!error && data) {
      const expiresAt = Date.now() + EXPIRES_IN * 1000;
      for (const row of data) {
        if (row.signedUrl && row.path) {
          cache.set(row.path, { url: row.signedUrl, expiresAt });
          result[row.path] = row.signedUrl;
        }
      }
    }
  }

  return result;
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const map = await getSignedUrls(supabase, [path]);
  return map[path] ?? null;
}
