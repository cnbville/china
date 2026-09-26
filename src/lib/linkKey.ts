import { parseLink } from "./links";

// A canonical identity for a product/link URL, so "the same thing saved twice"
// is caught even when tracking params differ. It reuses the reps link parser
// (src/lib/links.ts): a direct OR agent link to the same product resolves to the
// same "marketplace:id" key. Anything it can't resolve falls back to host + path
// + meaningful query, minus common tracking junk.

const TRACKING = new Set([
  "spm",
  "scm",
  "pvid",
  "utparam",
  "sourcetype",
  "cpp",
  "sk",
  "tracelog",
  "share_crt_v",
  "shareurl",
  "short_name",
  "app",
  "bft",
  "ali_refid",
  "ali_trackid",
  "from",
  "fromsite",
  "cpm",
  "clickid",
  "union_lens",
  "_immersivemode",
]);

export function linkKey(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(t) ? t : "https://" + t);
  } catch {
    return t.toLowerCase();
  }
  // A direct OR agent link the reps parser recognises → "marketplace:id"
  // (tmall folded into taobao's id space, as before, so they still dedupe).
  const parsed = parseLink(t);
  if (parsed) {
    const mp = parsed.marketplace === "tmall" ? "taobao" : parsed.marketplace;
    return `${mp}:${parsed.id}`;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");

  // Generic: host + path + the non-tracking query params, sorted for stability.
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.has(k.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort();
  return `${host}${path}${params.length ? "?" + params.join("&") : ""}`;
}
