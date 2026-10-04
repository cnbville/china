// "Search on doppel.fit": open doppel.fit and have the extension type the
// product into its own search bar. We can't rely on a search URL format we
// can't verify, so the hand-off rides in the URL hash (#pc-search=…, never
// sent to their server); the extension's script on doppel.fit reads it, fills
// the search box and submits — and offers the other queries (link · item
// number · name) as one-tap retries. Without the extension it just opens
// doppel.fit.

import { marketplaceUrl, type ParsedLink } from "./links";

export const DOPPEL_URL = "https://doppel.fit/";

export type DoppelSearch = { q: string[]; label?: string };

/** What to search for, best first. A name you wrote yourself leads when asked. */
export function doppelQueries(
  p: ParsedLink | null,
  title?: string | null,
  titleFirst = false,
): string[] {
  const name = (title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const out: string[] = [];
  if (name && titleFirst) out.push(name);
  if (p) out.push(marketplaceUrl(p.marketplace, p.id), p.id);
  if (name && !titleFirst) out.push(name);
  return Array.from(new Set(out));
}

export function doppelSearchUrl(queries: string[], label?: string): string {
  if (!queries.length) return DOPPEL_URL;
  const payload: DoppelSearch = { q: queries, ...(label ? { label } : {}) };
  return `${DOPPEL_URL}#pc-search=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function readDoppelHash(hash: string): DoppelSearch | null {
  const m = hash.match(/[#&]pc-search=([^&]+)/);
  if (!m) return null;
  try {
    const v = JSON.parse(decodeURIComponent(m[1]));
    if (v && Array.isArray(v.q) && v.q.every((x: unknown) => typeof x === "string") && v.q.length) {
      return { q: v.q.slice(0, 5), label: typeof v.label === "string" ? v.label : undefined };
    }
  } catch {
    /* malformed */
  }
  return null;
}

/** Short tag for a query chip: "Link", "Item #", or "Name". */
export function queryKind(q: string): "Link" | "Item #" | "Name" {
  if (/^https?:\/\//i.test(q)) return "Link";
  if (/^\d{5,}$/.test(q)) return "Item #";
  return "Name";
}
