// A canonical identity for a product/link URL, so "the same thing saved twice"
// is caught even when tracking params differ. Best-effort and host-aware: for
// the reseller sites we know, it reduces to the product id; otherwise it's the
// host + path + meaningful query, minus common tracking junk.

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
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");

  // 1688: identity is the offer id in the path (/offer/123.html).
  if (/(^|\.)1688\.com$/.test(host)) {
    const m = u.pathname.match(/\/offer\/(\d+)/) || t.match(/offer\/(\d+)/);
    if (m) return `1688:${m[1]}`;
  }
  // Taobao / Tmall: the id is a query param.
  if (/(^|\.)taobao\.com$/.test(host) || /(^|\.)tmall\.com$/.test(host)) {
    const id = u.searchParams.get("id");
    if (id) return `taobao:${id}`;
  }
  // Weidian: itemID / itemId query param.
  if (/(^|\.)weidian\.com$/.test(host) || /(^|\.)koudai\.com$/.test(host)) {
    const id = u.searchParams.get("itemID") || u.searchParams.get("itemId");
    if (id) return `weidian:${id}`;
  }

  // Generic: host + path + the non-tracking query params, sorted for stability.
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.has(k.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort();
  return `${host}${path}${params.length ? "?" + params.join("&") : ""}`;
}
