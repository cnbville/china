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

/** Pull marketplace + id out of a DIRECT marketplace link — desktop, mobile,
 *  app-share and international variants, with any tracking junk around it. */
export function parseDirect(u: URL): ParsedLink | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const q = (...names: string[]) => {
    for (const n of names) {
      const v = u.searchParams.get(n);
      if (v && /^\d+$/.test(v)) return v;
    }
    return null;
  };
  if (/(^|\.)taobao\.com$/.test(host)) {
    // item.taobao.com / h5.m.taobao.com / m.intl.taobao.com … ?id=
    const id = q("id", "itemId", "item_id");
    if (id) return { marketplace: "taobao", id };
    // world.taobao.com/item/123.htm · a.m.taobao.com/i123.htm
    const m = u.pathname.match(/\/item\/(\d{6,})/) || u.pathname.match(/\/i(\d{6,})\.htm/);
    if (m) return { marketplace: "taobao", id: m[1] };
  }
  if (/(^|\.)tmall\.(com|hk)$/.test(host)) {
    // detail.tmall.com / detail.m.tmall.com / detail.tmall.hk … ?id=
    const id = q("id", "itemId", "item_id");
    if (id) return { marketplace: "tmall", id };
    const m = u.pathname.match(/\/item\/(\d{6,})/);
    if (m) return { marketplace: "tmall", id: m[1] };
  }
  if (
    /(^|\.)weidian\.com$/.test(host) ||
    /(^|\.)koudai\.com$/.test(host) ||
    /(^|\.)youshop10\.com$/.test(host)
  ) {
    // weidian.com/item.html?itemID= · shop123.v.weidian.com · k.youshop10.com
    const id = q("itemID", "itemId", "itemid", "item_id");
    if (id) return { marketplace: "weidian", id };
    const m = u.pathname.match(/\/item\/(\d{6,})/);
    if (m) return { marketplace: "weidian", id: m[1] };
  }
  if (/(^|\.)1688\.com$/.test(host)) {
    const m = u.pathname.match(/\/offer\/(\d+)/);
    if (m) return { marketplace: "1688", id: m[1] };
    // detail.m.1688.com/page/index.html?offerId=
    const id = q("offerId", "offerid");
    if (id) return { marketplace: "1688", id };
  }
  return null;
}

/** Taobao and Tmall share one item-id space, so either link opens the item. */
export function twinMarketplace(mp: Marketplace): Marketplace | null {
  return mp === "taobao" ? "tmall" : mp === "tmall" ? "taobao" : null;
}

// --- Agent definitions -------------------------------------------------------
// Every agent Jadeship tracks (their extension's list, 36 agents). Formats drift,
// so each agent is a small config entry — adding or fixing one is a one-liner.
//
// `verified` = the build format is confirmed from a real, working converter or
// real product links. Unverified agents use their known URL path with a best-
// guess query; the UI flags them so a guess never silently sends you somewhere
// broken. Pasting a link FROM any agent still resolves (see parseAgentGeneric).
//
// Schemes:
//   encoded_url — the full marketplace URL wrapped in a query param
//   params      — ?<id>=123&<marketplace param>=<value>   (CNFans, ACBuy, …)
//   path_code   — /product/<marketplace code>/<id>        (Hoobuy, OopBuy, …)
//   cssbuy      — CSSBuy's own item-{id}.html / goodsDetail?type=&id= shapes

type AgentBase = {
  key: string;
  name: string;
  hosts: string[];
  verified: boolean;
};
export type AgentDef =
  | (AgentBase & { scheme: "encoded_url"; base: string; param: string })
  | (AgentBase & {
      scheme: "params";
      base: string;
      idParam: string;
      mpParam: string;
      mpValues: Record<Marketplace, string>;
    })
  | (AgentBase & {
      scheme: "path_code";
      base: string;
      codes: Record<Marketplace, string>;
      aliases?: Record<string, Marketplace>;
      suffix?: string;
    })
  | (AgentBase & { scheme: "cssbuy" });

// The CNFans-style family (shared SaaS): ?shop_type=<mp>&id=<id>
const SHOP_TYPE: Record<Marketplace, string> = {
  taobao: "taobao",
  tmall: "taobao", // routed through taobao's id space
  weidian: "weidian",
  "1688": "ali_1688",
};
const shopType = (key: string, name: string, host: string, verified: boolean): AgentDef => ({
  key,
  name,
  hosts: [host],
  verified,
  scheme: "params",
  base: `https://${host === "lovegobuy.com" ? "www." : ""}${host}/product/`,
  idParam: "id",
  mpParam: "shop_type",
  mpValues: SHOP_TYPE,
});
const wrapped = (
  key: string,
  name: string,
  host: string,
  base: string,
  verified: boolean,
  param = "url",
): AgentDef => ({ key, name, hosts: [host], verified, scheme: "encoded_url", base, param });
// Hoobuy's numeric marketplace codes (confirmed): 1 Taobao · 0 1688 · 2 Weidian
const NUM_CODES: Record<Marketplace, string> = { taobao: "1", tmall: "1", "1688": "0", weidian: "2" };
const NAMED: Record<Marketplace, string> = { taobao: "taobao", tmall: "tmall", "1688": "1688", weidian: "weidian" };

export const AGENTS: AgentDef[] = [
  // ---- confirmed formats ----
  wrapped("superbuy", "Superbuy", "superbuy.com", "https://www.superbuy.com/en/page/buy/", true),
  wrapped("wegobuy", "Wegobuy", "wegobuy.com", "https://www.wegobuy.com/en/page/buy/", true),
  wrapped("allchinabuy", "AllChinaBuy", "allchinabuy.com", "https://www.allchinabuy.com/en/page/buy/", true),
  wrapped("kakobuy", "Kakobuy", "kakobuy.com", "https://www.kakobuy.com/item/details", true),
  wrapped("sugargoo", "Sugargoo", "sugargoo.com", "https://www.sugargoo.com/#/home/productDetail", true, "productLink"),
  shopType("cnfans", "CNFans", "cnfans.com", true),
  shopType("mulebuy", "MuleBuy", "mulebuy.com", true),
  shopType("orientdig", "OrientDig", "orientdig.com", true),
  {
    key: "acbuy", name: "ACBuy", hosts: ["acbuy.com"], verified: true,
    scheme: "params", base: "https://www.acbuy.com/product/", idParam: "id", mpParam: "source",
    mpValues: { taobao: "TB", tmall: "TB", weidian: "WD", "1688": "AL" },
  },
  {
    key: "cnshopper", name: "CNShopper", hosts: ["cnshopper.com"], verified: true,
    scheme: "params", base: "https://cnshopper.com/goods/detail", idParam: "keyword", mpParam: "platform",
    mpValues: { taobao: "taobao", tmall: "taobao", weidian: "weidian", "1688": "1688" },
  },
  {
    key: "hoobuy", name: "Hoobuy", hosts: ["hoobuy.com"], verified: true,
    scheme: "path_code", base: "https://www.hoobuy.com/product", codes: NUM_CODES,
  },
  {
    key: "oopbuy", name: "OopBuy", hosts: ["oopbuy.com"], verified: true,
    scheme: "path_code", base: "https://www.oopbuy.com/product",
    codes: { taobao: "1", tmall: "1", "1688": "0", weidian: "weidian" },
    aliases: { "2": "weidian", taobao: "taobao", "1688": "1688" },
  },
  { key: "cssbuy", name: "CSSBuy", hosts: ["cssbuy.com"], verified: true, scheme: "cssbuy" },

  // ---- unconfirmed formats (known URL path, best-guess query) ----
  shopType("lovegobuy", "LoveGoBuy", "lovegobuy.com", false),
  shopType("joyabuy", "JoyaBuy", "joyabuy.com", false),
  shopType("joyagoo", "JoyaGoo", "joyagoo.com", false),
  shopType("gtbuy", "GTBuy", "gtbuy.com", false),
  shopType("litbuy", "LitBuy", "litbuy.com", false),
  {
    key: "usfans", name: "USFans", hosts: ["usfans.com"], verified: false,
    scheme: "path_code", base: "https://www.usfans.com/product", codes: NUM_CODES,
  },
  {
    key: "hipobuy", name: "HipoBuy", hosts: ["hipobuy.com"], verified: false,
    scheme: "path_code", base: "https://hipobuy.com/product", codes: NUM_CODES,
  },
  {
    key: "basetao", name: "Basetao", hosts: ["basetao.com"], verified: false,
    scheme: "path_code", base: "https://www.basetao.com/best-taobao-agent-service/products/agent",
    codes: NAMED, suffix: ".html",
  },
  {
    key: "sifubuy", name: "SifuBuy", hosts: ["sifubuy.com"], verified: false,
    scheme: "params", base: "https://www.sifubuy.com/detail", idParam: "id", mpParam: "type",
    mpValues: NAMED,
  },
  wrapped("hagobuy", "Hagobuy", "hagobuy.com", "https://www.hagobuy.com/item/details", false),
  wrapped("hegobuy", "Hegobuy", "hegobuy.com", "https://www.hegobuy.com/item/details", false),
  wrapped("pandabuy", "Pandabuy", "pandabuy.com", "https://www.pandabuy.com/product", false),
  wrapped("loongbuy", "LoongBuy", "loongbuy.com", "https://www.loongbuy.com/product-details", false),
  wrapped("itaobuy", "iTaoBuy", "itaobuy.com", "https://www.itaobuy.com/product-detail", false),
  wrapped("lolobuy", "LoloBuy", "lolobuy.com", "https://www.lolobuy.com/productDetail", false),
  wrapped("fishgoo", "Fishgoo", "fishgoo.com", "https://www.fishgoo.com/#/product", false),
  wrapped("panglobalbuy", "PanGlobalBuy", "panglobalbuy.com", "https://panglobalbuy.com/#/details", false),
  wrapped("kameymall", "KameyMall", "kameymall.com", "https://www.kameymall.com/purchases/search/item", false),
  wrapped("ezbuycn", "EZBuyCN", "ezbuycn.com", "https://ezbuycn.com/api/chaid.aspx", false, "key"),
  wrapped("blikbuy", "BlikBuy", "blikbuy.com", "https://www.blikbuy.com/?go=item", false),
  wrapped("ponybuy", "PonyBuy", "ponybuy.com", "https://www.ponybuy.com/", false),
  wrapped("eastmallbuy", "EastMallBuy", "eastmallbuy.com", "https://eastmallbuy.com/index/item/index.html?tp=taobao&searchlang=en", false),
  wrapped("hubbuycn", "HubbuyCN", "hubbuycn.com", "https://www.hubbuycn.com/index/item/index.html?tp=taobao&searchlang=en", false),
];

export const AGENTS_BY_KEY: Record<string, AgentDef> = Object.fromEntries(
  AGENTS.map((a) => [a.key, a]),
);

/** Confirmed agents first (alphabetical), then unconfirmed (alphabetical). */
export const AGENTS_SORTED: AgentDef[] = [...AGENTS].sort(
  (a, b) =>
    Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name),
);

function hostMatches(u: URL, hosts: string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  return hosts.some((x) => h === x || h.endsWith("." + x));
}

// CSSBuy: item-{id}.html · item-micro-{id} (weidian) · item-1688-{id} ·
// item-tmall-{id}; and the newer /shop/goodsDetail?type=micro&id=… pages.
function cssbuyBuild(mp: Marketplace, id: string): string {
  const seg =
    mp === "weidian"
      ? `item-micro-${id}`
      : mp === "1688"
        ? `item-1688-${id}`
        : mp === "tmall"
          ? `item-tmall-${id}`
          : `item-${id}`;
  return `https://www.cssbuy.com/${seg}.html`;
}
function cssbuyParse(u: URL): ParsedLink | null {
  const m = u.pathname.match(/item-(micro-|1688-|tmall-)?(\d+)/);
  if (m) {
    const id = m[2];
    if (m[1] === "micro-") return { marketplace: "weidian", id };
    if (m[1] === "1688-") return { marketplace: "1688", id };
    if (m[1] === "tmall-") return { marketplace: "tmall", id };
    return { marketplace: "taobao", id };
  }
  const id = u.searchParams.get("id");
  if (id && /goodsDetail/i.test(u.pathname)) {
    const t = (u.searchParams.get("type") ?? "").toLowerCase();
    if (t === "micro" || t === "weidian") return { marketplace: "weidian", id };
    if (t === "1688" || t === "ali" || t === "alibaba") return { marketplace: "1688", id };
    if (t === "tmall") return { marketplace: "tmall", id };
    return { marketplace: "taobao", id };
  }
  return null;
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

// Query params from both the real query string and a hash route ("#/x?a=b").
function allParams(u: URL): URLSearchParams {
  const p = new URLSearchParams(u.search);
  const q = u.hash.indexOf("?");
  if (q >= 0) new URLSearchParams(u.hash.slice(q + 1)).forEach((v, k) => p.append(k, v));
  return p;
}

/** Build a link to `agentKey` for a parsed product. Null if the agent is unknown. */
export function buildAgentLink(agentKey: string, p: ParsedLink): string | null {
  const a = AGENTS_BY_KEY[agentKey];
  if (!a) return null;
  switch (a.scheme) {
    case "encoded_url": {
      const sep = a.base.includes("?") ? "&" : "?";
      return `${a.base}${sep}${a.param}=${encodeURIComponent(marketplaceUrl(p.marketplace, p.id))}`;
    }
    case "params":
      return `${a.base}?${a.idParam}=${p.id}&${a.mpParam}=${a.mpValues[p.marketplace]}`;
    case "path_code":
      return `${a.base}/${a.codes[p.marketplace]}/${p.id}${a.suffix ?? ""}`;
    case "cssbuy":
      return cssbuyBuild(p.marketplace, p.id);
  }
}

// Parse a link with the agent's own scheme.
function parseWithScheme(a: AgentDef, u: URL): ParsedLink | null {
  switch (a.scheme) {
    case "encoded_url": {
      const inner = readEncodedParam(u.href, a.param);
      const iu = inner ? toURL(inner) : null;
      return iu ? parseDirect(iu) : null;
    }
    case "params": {
      const ps = allParams(u);
      const id = ps.get(a.idParam);
      const v = ps.get(a.mpParam);
      if (!id || !v || !/^\d+$/.test(id)) return null;
      const mp = (Object.keys(a.mpValues) as Marketplace[]).find(
        (k) => a.mpValues[k].toLowerCase() === v.toLowerCase(),
      );
      return mp ? { marketplace: mp, id } : null;
    }
    case "path_code": {
      const m = u.pathname.match(/\/product(?:s\/agent)?\/([^/]+)\/(\d+)/);
      if (!m) return null;
      const code = decodeURIComponent(m[1]).toLowerCase();
      const mp =
        (Object.keys(a.codes) as Marketplace[]).find(
          (k) => a.codes[k].toLowerCase() === code && k !== "tmall",
        ) ?? a.aliases?.[code];
      return mp ? { marketplace: mp, id: m[2] } : null;
    }
    case "cssbuy":
      return cssbuyParse(u);
  }
}

// Words agents use for each marketplace in their params / paths.
const MP_HINTS: [RegExp, Marketplace][] = [
  [/^(?:weidian|wd|micro|vdian)$/i, "weidian"],
  [/^(?:1688|ali_?1688|al|alibaba)$/i, "1688"],
  [/^(?:tmall|tm)$/i, "tmall"],
  [/^(?:taobao|tb)$/i, "taobao"],
];
const hintMp = (v: string): Marketplace | null =>
  MP_HINTS.find(([re]) => re.test(v))?.[1] ?? null;

/**
 * Safety net for agent links whose exact scheme we don't know (or that drifted):
 * any param that wraps a marketplace URL; a /<marketplace>/<id> path; or a
 * numeric id param next to a marketplace word (shop_type, platform, source, …).
 */
export function parseAgentGeneric(u: URL): ParsedLink | null {
  const ps = allParams(u);
  for (const [, v] of ps) {
    if (!/taobao|tmall|weidian|1688|youshop10/i.test(v)) continue;
    const iu = toURL(v);
    const d = iu && parseDirect(iu);
    if (d) return d;
  }
  const pm = (u.pathname + u.hash).match(/\/(taobao|tmall|weidian|1688|ali_1688|micro)\/(\d{6,})/i);
  if (pm) {
    const mp = hintMp(pm[1]);
    if (mp) return { marketplace: mp, id: pm[2] };
  }
  const idKey = ["id", "itemid", "item_id", "goodsid", "goods_id", "offerid", "productid", "keyword"];
  let id: string | null = null;
  let mp: Marketplace | null = null;
  for (const [k, v] of ps) {
    const kl = k.toLowerCase();
    if (!id && idKey.includes(kl) && /^\d{6,}$/.test(v)) id = v;
    if (!mp) mp = hintMp(v);
  }
  return id && mp ? { marketplace: mp, id } : null;
}

function parseAgent(u: URL): ParsedLink | null {
  for (const a of AGENTS) {
    if (!hostMatches(u, a.hosts)) continue;
    return parseWithScheme(a, u) ?? parseAgentGeneric(u);
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
  return parseDirect(u) ?? parseAgent(u);
}

// --- Bulk extraction ---------------------------------------------------------

// Hosts we recognise even when a link is pasted without "https://".
const BARE_HOSTS = [
  "taobao.com",
  "tmall.com",
  "tmall.hk",
  "weidian.com",
  "koudai.com",
  "1688.com",
  "tb.cn",
  "youshop10.com",
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
