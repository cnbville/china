// Reps link core (local, offline, no network). Parse the underlying marketplace
// (taobao / tmall / weidian / 1688) + item id out of any direct OR agent link,
// then rebuild it in a target agent's format.
//
// Agent formats drift, so each agent is a small config entry below — adding or
// fixing one is a one-liner, and every agent has a round-trip unit test
// (links.test.ts). Encrypted / shortened links (m.tb.cn, pandabuy.page.link,
// sl.kakobuy.com …) can't be resolved here — they need a server to follow the
// redirect; that's a separate fallback (see the plan), not this module.

export type Marketplace = "taobao" | "tmall" | "weidian" | "1688";
export type ParsedLink = { marketplace: Marketplace; id: string };

/** Canonical direct link for a marketplace + id. */
export function marketplaceUrl(mp: Marketplace, id: string): string {
  switch (mp) {
    case "taobao":
      return `https://item.taobao.com/item.htm?id=${id}`;
    case "tmall":
      return `https://detail.tmall.com/item.htm?id=${id}`;
    case "weidian":
      return `https://weidian.com/item.html?itemID=${id}`;
    case "1688":
      return `https://detail.1688.com/offer/${id}.html`;
  }
}

function toURL(raw: string): URL | null {
  const t = (raw || "").trim();
  if (!t) return null;
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : "https://" + t);
  } catch {
    return null;
  }
}

/** Pull marketplace + id out of a DIRECT marketplace link. */
export function parseDirect(u: URL): ParsedLink | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)taobao\.com$/.test(host)) {
    const id = u.searchParams.get("id");
    if (id) return { marketplace: "taobao", id };
  }
  if (/(^|\.)tmall\.com$/.test(host)) {
    const id = u.searchParams.get("id");
    if (id) return { marketplace: "tmall", id };
  }
  if (/(^|\.)weidian\.com$/.test(host) || /(^|\.)koudai\.com$/.test(host)) {
    const id = u.searchParams.get("itemID") || u.searchParams.get("itemId");
    if (id) return { marketplace: "weidian", id };
  }
  if (/(^|\.)1688\.com$/.test(host)) {
    const m = u.pathname.match(/\/offer\/(\d+)/);
    if (m) return { marketplace: "1688", id: m[1] };
  }
  return null;
}

// --- Agent definitions -------------------------------------------------------
// Three schemes cover the ecosystem:
//   encoded_url — the agent wraps the full marketplace URL in a query param
//                 (safest: the inner link is our own canonical one)
//   shop_type   — ?shop_type=<mp>&id=<id> (the newer affiliate family)
//   path        — id baked into the path (cssbuy)

type AgentBase = { key: string; name: string; hosts: string[] };
type AgentDef =
  | (AgentBase & { scheme: "encoded_url"; base: string; param: string })
  | (AgentBase & {
      scheme: "shop_type";
      base: string;
      mpParam: Record<Marketplace, string>;
    })
  | (AgentBase & { scheme: "path" });

// shop_type values shared by the CNFans-style family.
const SHOP_TYPE: Record<Marketplace, string> = {
  taobao: "taobao",
  tmall: "taobao", // these agents route tmall through taobao's id space
  weidian: "weidian",
  "1688": "ali_1688",
};

export const AGENTS: AgentDef[] = [
  // encoded_url family
  { key: "superbuy", name: "Superbuy", hosts: ["superbuy.com"], scheme: "encoded_url", base: "https://www.superbuy.com/en/page/buy/", param: "url" },
  { key: "wegobuy", name: "Wegobuy", hosts: ["wegobuy.com"], scheme: "encoded_url", base: "https://www.wegobuy.com/en/page/buy/", param: "url" },
  { key: "allchinabuy", name: "AllChinaBuy", hosts: ["allchinabuy.com"], scheme: "encoded_url", base: "https://www.allchinabuy.com/en/page/buy/", param: "url" },
  { key: "kakobuy", name: "Kakobuy", hosts: ["kakobuy.com"], scheme: "encoded_url", base: "https://www.kakobuy.com/item/details", param: "url" },
  { key: "hagobuy", name: "Hagobuy", hosts: ["hagobuy.com"], scheme: "encoded_url", base: "https://www.hagobuy.com/item/details", param: "url" },
  { key: "sugargoo", name: "Sugargoo", hosts: ["sugargoo.com"], scheme: "encoded_url", base: "https://www.sugargoo.com/#/home/productDetail", param: "productLink" },
  { key: "pandabuy", name: "Pandabuy", hosts: ["pandabuy.com"], scheme: "encoded_url", base: "https://www.pandabuy.com/product", param: "url" },
  // shop_type family
  { key: "cnfans", name: "CNFans", hosts: ["cnfans.com"], scheme: "shop_type", base: "https://cnfans.com/product", mpParam: SHOP_TYPE },
  { key: "mulebuy", name: "MuleBuy", hosts: ["mulebuy.com"], scheme: "shop_type", base: "https://mulebuy.com/product", mpParam: SHOP_TYPE },
  { key: "orientdig", name: "OrientDig", hosts: ["orientdig.com"], scheme: "shop_type", base: "https://orientdig.com/product", mpParam: SHOP_TYPE },
  { key: "lovegobuy", name: "LoveGoBuy", hosts: ["lovegobuy.com"], scheme: "shop_type", base: "https://www.lovegobuy.com/product", mpParam: SHOP_TYPE },
  // path family
  { key: "cssbuy", name: "CSSBUY", hosts: ["cssbuy.com"], scheme: "path" },
];

export const AGENTS_BY_KEY: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.key, a]),
);

function hostMatches(u: URL, hosts: string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  return hosts.some((x) => h === x || h.endsWith("." + x));
}

// cssbuy path encoding: item-{id}, item-micro-{id} (weidian), item-1688-{id},
// item-tmall-{id}.
function cssbuyBuild(mp: Marketplace, id: string): string {
  const seg =
    mp === "weidian"
      ? `item-micro-${id}`
      : mp === "1688"
        ? `item-1688-${id}`
        : mp === "tmall"
          ? `item-tmall-${id}`
          : `item-${id}`;
  return `https://cssbuy.com/${seg}.html`;
}
function cssbuyParse(u: URL): ParsedLink | null {
  const m = u.pathname.match(/item-(micro-|1688-|tmall-)?(\d+)/);
  if (!m) return null;
  const kind = m[1];
  const id = m[2];
  if (kind === "micro-") return { marketplace: "weidian", id };
  if (kind === "1688-") return { marketplace: "1688", id };
  if (kind === "tmall-") return { marketplace: "tmall", id };
  return { marketplace: "taobao", id };
}

// Read a wrapped inner URL out of an agent link's param, tolerating query- or
// hash-routed params and up to two layers of URL-encoding.
function readEncodedParam(href: string, param: string): string | null {
  const m = href.match(new RegExp("[?&#]" + param + "=([^&]+)"));
  if (!m) return null;
  let v = m[1];
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(v); i++) {
    try {
      v = decodeURIComponent(v);
    } catch {
      break;
    }
  }
  return v;
}

/** Build a link to `agentKey` for a parsed product. Null if the agent is unknown. */
export function buildAgentLink(agentKey: string, p: ParsedLink): string | null {
  const a = AGENTS_BY_KEY[agentKey];
  if (!a) return null;
  switch (a.scheme) {
    case "encoded_url":
      return `${a.base}?${a.param}=${encodeURIComponent(marketplaceUrl(p.marketplace, p.id))}`;
    case "shop_type":
      return `${a.base}?shop_type=${a.mpParam[p.marketplace]}&id=${p.id}`;
    case "path":
      return cssbuyBuild(p.marketplace, p.id);
  }
}

function parseAgent(u: URL, href: string): ParsedLink | null {
  for (const a of AGENTS) {
    if (!hostMatches(u, a.hosts)) continue;
    if (a.scheme === "encoded_url") {
      const inner = readEncodedParam(href, a.param);
      if (inner) {
        const iu = toURL(inner);
        if (iu) {
          const d = parseDirect(iu);
          if (d) return d;
        }
      }
    } else if (a.scheme === "shop_type") {
      const st = u.searchParams.get("shop_type");
      const id = u.searchParams.get("id");
      if (st && id) {
        const mp = (Object.keys(a.mpParam) as Marketplace[]).find(
          (k) => a.mpParam[k] === st,
        );
        if (mp) return { marketplace: mp, id };
      }
    } else if (a.scheme === "path") {
      const d = cssbuyParse(u);
      if (d) return d;
    }
  }
  return null;
}

/** Which agent (if any) a link belongs to — for showing "detected: CNFans". */
export function detectAgent(raw: string): AgentDef | null {
  const u = toURL(raw);
  if (!u) return null;
  return AGENTS.find((a) => hostMatches(u, a.hosts)) ?? null;
}

/**
 * Parse any direct or agent link to { marketplace, id }, or null if it can't be
 * resolved locally (unknown host, or an encrypted/shortened link that needs the
 * server redirect fallback).
 */
export function parseLink(raw: string): ParsedLink | null {
  const u = toURL(raw);
  if (!u) return null;
  return parseDirect(u) ?? parseAgent(u, u.href);
}

// --- Bulk extraction ---------------------------------------------------------

// Hosts we recognise even when a link is pasted without "https://".
const BARE_HOSTS = [
  "taobao.com",
  "tmall.com",
  "weidian.com",
  "koudai.com",
  "1688.com",
  "tb.cn",
  ...AGENTS.flatMap((a) => a.hosts),
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/gi;
const BARE_RE = new RegExp(
  "(?:^|[\\s(\\[<\"'])((?:[\\w-]+\\.)*(?:" +
    BARE_HOSTS.map(escapeRe).join("|") +
    ")\\/[^\\s<>\"'`)\\]}]*)",
  "gi",
);

const MD_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;

/** A link found in pasted text, with the human label written next to it. */
export type LinkEntry = { url: string; label: string };

type Hit = { url: string; start: number; end: number; md?: string };

// Every link on one line with its position: markdown [label](url), full URLs,
// and bare marketplace/agent links — each counted once, left to right.
function findLinksInLine(line: string): Hit[] {
  const hits: Hit[] = [];
  const blank = (str: string, a: number, b: number) =>
    str.slice(0, a) + " ".repeat(b - a) + str.slice(b);
  let masked = line;
  for (const m of line.matchAll(MD_RE)) {
    const a = m.index ?? 0;
    const b = a + m[0].length;
    hits.push({ url: m[2], start: a, end: b, md: m[1] });
    masked = blank(masked, a, b);
  }
  for (const m of masked.matchAll(URL_RE)) {
    const a = m.index ?? 0;
    hits.push({ url: m[0], start: a, end: a + m[0].length });
  }
  const noUrls = masked.replace(URL_RE, (x) => " ".repeat(x.length));
  for (const m of noUrls.matchAll(BARE_RE)) {
    const a = (m.index ?? 0) + (m[0].length - m[1].length);
    hits.push({ url: m[1], start: a, end: a + m[1].length });
  }
  return hits.sort((x, y) => x.start - y.start);
}

const FILLER =
  /^(?:w2c|wtc|link|links|here|this|this one|url|click|click here|lc|buy|cop|and|or|also)$/i;
const SEP = "\\s:;,.\\-–—→»=>|~•·";

/** Turn the text around a link into a clean, short label — or "" if it's noise. */
export function cleanLabel(raw: string): string {
  let t = raw
    .replace(/\*\*|__|`/g, "")
    .replace(/^[\s>#]+/, "")
    .replace(/^\s*(?:[-*•·▪►➤→]+|\d+[.)])\s+/, "")
    .replace(new RegExp(`^[${SEP})\\]]+`), "")
    .replace(/^(?:w2c|wtc|where to cop)\b/i, "")
    .replace(new RegExp(`^[${SEP})\\]]+`), "")
    .replace(new RegExp(`[${SEP}(\\[]+$`), "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || FILLER.test(t) || /https?:\/\/|www\.|\.(?:com|cn)\//i.test(t)) return "";
  if (t.length > 80) t = t.slice(0, 79).trimEnd() + "…";
  return t;
}

// A line with no link that reads like a section title ("Jackets", "**Tees**",
// "Shoes:") labels the bare links under it. Prose lines don't.
function headingOf(line: string): string {
  const t = line.trim();
  const looks =
    /^#{1,6}\s/.test(t) ||
    /^(\*\*|__).+(\*\*|__):?$/.test(t) ||
    /:$/.test(t) ||
    (t.split(/\s+/).length <= 3 && !/[.!?]$/.test(t));
  if (!looks) return "";
  const h = cleanLabel(t);
  return h.length <= 40 ? h : "";
}

/**
 * Pull every link out of a blob of text — a Reddit post, a spreadsheet column,
 * a chat dump — together with the label written next to it:
 *   "hoodie https://…"            → label before the link
 *   "https://… - hoodie"          → label after the link
 *   "[Travis 1s](https://…)"      → markdown link text
 *   "**Jackets**" then "- https://…" lines → the heading labels bare links
 * Full URLs and bare marketplace/agent links (no "https://") are both caught,
 * trailing punctuation is trimmed, order is kept, duplicates are merged (the
 * first non-empty label wins).
 */
export function extractLinkEntries(text: string): LinkEntry[] {
  const out: LinkEntry[] = [];
  const at = new Map<string, number>();
  const add = (rawUrl: string, label: string) => {
    const url = rawUrl.replace(/[.,;:!?]+$/, "");
    if (!url) return;
    const i = at.get(url);
    if (i != null) {
      if (!out[i].label && label) out[i].label = label;
      return;
    }
    at.set(url, out.length);
    out.push({ url, label });
  };

  let heading = "";
  for (const line of text.split(/\r?\n/)) {
    const hits = findLinksInLine(line);
    if (hits.length === 0) {
      if (line.trim()) heading = headingOf(line);
      continue;
    }
    // Is this line written "label → link" or "link → label"?
    const firstBefore = cleanLabel(line.slice(0, hits[0].start));
    const firstAfter = cleanLabel(
      line.slice(hits[0].end, hits[1]?.start ?? line.length),
    );
    const labelAfter = !hits[0].md && !firstBefore && !!firstAfter;

    hits.forEach((h, j) => {
      let label = h.md ? cleanLabel(h.md) : "";
      if (!label) {
        label = labelAfter
          ? cleanLabel(line.slice(h.end, hits[j + 1]?.start ?? line.length))
          : cleanLabel(line.slice(j === 0 ? 0 : hits[j - 1].end, h.start));
      }
      add(h.url, label || heading);
    });
  }
  return out;
}

/** Just the links from a blob of text (see extractLinkEntries). */
export function extractLinks(text: string): string[] {
  return extractLinkEntries(text).map((e) => e.url);
}
