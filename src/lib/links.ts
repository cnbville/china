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
