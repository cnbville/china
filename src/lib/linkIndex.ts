import type { SupabaseClient } from "@supabase/supabase-js";
import { linkKey } from "./linkKey";
import { activeSpace, inSpace } from "./space";

// Where a link already lives in your data. "item" = a catalogued item's source.
export type LinkHit = {
  where: "item" | "later" | "junk";
  itemId?: string;
  title?: string;
};

/**
 * Index every link you already have — item sources, Later, Junk — keyed by the
 * canonical linkKey, so any screen can say "you've already got this". Later and
 * Junk are optional (their tables may not exist yet); a missing table never
 * breaks the index. Items win over Later over Junk when a link is in several.
 */
export async function loadLinkIndex(
  supabase: SupabaseClient,
): Promise<Map<string, LinkHit>> {
  const idx = new Map<string, LinkHit>();
  const put = (k: string, hit: LinkHit) => {
    if (k && !idx.has(k)) idx.set(k, hit);
  };

  // Only the side you're on (clothes / PC) — the two are kept fully separate.
  const space = await activeSpace();
  try {
    const [{ data: srcs }, { data: items }] = await Promise.all([
      supabase.from("sources").select("url, item_id"),
      inSpace(supabase.from("items").select("id, title"), space),
    ]);
    const titleById = new Map(
      ((items ?? []) as { id: string; title: string }[]).map((i) => [
        i.id,
        i.title,
      ]),
    );
    for (const r of (srcs ?? []) as { url: string; item_id: string | null }[]) {
      if (space && (!r.item_id || !titleById.has(r.item_id))) continue; // other side
      put(linkKey(r.url), {
        where: "item",
        itemId: r.item_id ?? undefined,
        title: r.item_id ? titleById.get(r.item_id) : undefined,
      });
    }
  } catch {
    /* ignore */
  }
  try {
    const { data } = await inSpace(supabase.from("saved_links").select("url"), space);
    for (const r of (data ?? []) as { url: string }[])
      put(linkKey(r.url), { where: "later" });
  } catch {
    /* ignore */
  }
  try {
    const { data } = await inSpace(supabase.from("junk_links").select("url"), space);
    for (const r of (data ?? []) as { url: string }[])
      put(linkKey(r.url), { where: "junk" });
  } catch {
    /* ignore */
  }
  return idx;
}
