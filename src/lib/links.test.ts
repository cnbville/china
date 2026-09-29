import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  AGENTS_BY_KEY,
  AGENTS_SORTED,
  parseAgentGeneric,
  buildAgentLink,
  detectAgent,
  cleanLabel,
  extractLinkEntries,
  extractLinks,
  parseLink,
  marketplaceUrl,
  twinMarketplace,
  outputLink,
  RAW_KEY,
  type Marketplace,
  type ParsedLink,
} from "./links";
import { linkKey } from "./linkKey";

// --- Direct marketplace links parse correctly ---
const directCases: [string, ParsedLink][] = [
  [
    "https://item.taobao.com/item.htm?id=678901234567&spm=a1z09",
    { marketplace: "taobao", id: "678901234567" },
  ],
  [
    "https://detail.tmall.com/item.htm?id=555&abc=1",
    { marketplace: "tmall", id: "555" },
  ],
  [
    "https://weidian.com/item.html?itemID=7212345678&spider_token=x",
    { marketplace: "weidian", id: "7212345678" },
  ],
  [
    "https://detail.1688.com/offer/654321.html?spm=a260k",
    { marketplace: "1688", id: "654321" },
  ],
  ["https://m.1688.com/offer/654321.html", { marketplace: "1688", id: "654321" }],
  // Mobile / app-share / international variants, tracking junk and all
  [
    "https://h5.m.taobao.com/awp/core/detail.htm?ft=t&id=678901234567&spm=a2141.1",
    { marketplace: "taobao", id: "678901234567" },
  ],
  ["https://m.intl.taobao.com/detail/detail.html?id=678901234567", { marketplace: "taobao", id: "678901234567" }],
  ["https://a.m.taobao.com/i678901234567.htm?sm=1", { marketplace: "taobao", id: "678901234567" }],
  [
    "https://detail.m.tmall.com/item.htm?spm=a1z10&id=612345678901&skuId=5",
    { marketplace: "tmall", id: "612345678901" },
  ],
  ["https://detail.tmall.hk/hk/item.htm?id=612345678901", { marketplace: "tmall", id: "612345678901" }],
  [
    "https://shop1234567.v.weidian.com/item.html?itemID=7212345678&wfr=wx&share_relation=abc",
    { marketplace: "weidian", id: "7212345678" },
  ],
  ["https://weidian.com/item.html?itemId=7212345678&p=iphone", { marketplace: "weidian", id: "7212345678" }],
  ["https://detail.m.1688.com/page/index.html?offerId=654321987&spm=x", { marketplace: "1688", id: "654321987" }],
];

for (const [url, want] of directCases) {
  test(`parseDirect: ${url}`, () => {
    assert.deepEqual(parseLink(url), want);
  });
}

// --- Every configured agent round-trips: build → parse → same product ---
const samples: ParsedLink[] = [
  { marketplace: "taobao", id: "678901234567" },
  { marketplace: "weidian", id: "7212345678" },
  { marketplace: "1688", id: "654321" },
];

for (const agent of AGENTS) {
  for (const p of samples) {
    test(`round-trip ${agent.key} · ${p.marketplace}`, () => {
      const built = buildAgentLink(agent.key, p);
      assert.ok(built, `build returned null for ${agent.key}`);
      const back = parseLink(built as string);
      assert.deepEqual(
        back,
        p,
        `${agent.key} built ${built} which parsed to ${JSON.stringify(back)}`,
      );
      // The built link is detected as belonging to that agent.
      assert.equal(detectAgent(built as string)?.key, agent.key);
    });
  }
}

// --- A real-shaped agent link parses back to the underlying product ---
test("cnfans agent link → product", () => {
  assert.deepEqual(parseLink("https://cnfans.com/product?shop_type=weidian&id=7212345678"), {
    marketplace: "weidian",
    id: "7212345678",
  });
});

test("superbuy encoded link → product", () => {
  const inner = encodeURIComponent("https://item.taobao.com/item.htm?id=678901234567");
  assert.deepEqual(parseLink(`https://www.superbuy.com/en/page/buy/?url=${inner}`), {
    marketplace: "taobao",
    id: "678901234567",
  });
});

test("cssbuy path link → product", () => {
  assert.deepEqual(parseLink("https://cssbuy.com/item-micro-7212345678.html"), {
    marketplace: "weidian",
    id: "7212345678",
  });
});

// --- Unknown / unresolvable links return null ---
test("unknown host returns null", () => {
  assert.equal(parseLink("https://example.com/thing?id=1"), null);
});
test("encrypted short link returns null (needs server fallback)", () => {
  assert.equal(parseLink("https://m.tb.cn/h.abcdef"), null);
});

// --- linkKey dedupes a direct link and an agent link to the same product ---
test("linkKey: direct and agent link share a key", () => {
  const direct = linkKey("https://weidian.com/item.html?itemID=7212345678");
  const agent = linkKey("https://cnfans.com/product?shop_type=weidian&id=7212345678");
  assert.equal(direct, agent);
  assert.equal(direct, "weidian:7212345678");
});
test("linkKey: tmall folds into taobao id space", () => {
  assert.equal(
    linkKey("https://detail.tmall.com/item.htm?id=555"),
    linkKey("https://item.taobao.com/item.htm?id=555"),
  );
});

// Keep the Marketplace type referenced so unused-import lint stays quiet.
const _mp: Marketplace = "taobao";
void _mp;

// --- Bulk extraction ---

test("extractLinks: pulls full + bare links out of messy text, dedupes, trims", () => {
  const blob = `W2C hoodie: https://weidian.com/item.html?itemID=7212345678, also
  this one (https://cnfans.com/product?shop_type=taobao&id=678901234567).
  bare: detail.1688.com/offer/654321.html and again https://weidian.com/item.html?itemID=7212345678!
  random https://example.com/x`;
  // Document order (reading order of the post).
  assert.deepEqual(extractLinks(blob), [
    "https://weidian.com/item.html?itemID=7212345678",
    "https://cnfans.com/product?shop_type=taobao&id=678901234567",
    "detail.1688.com/offer/654321.html",
    "https://example.com/x",
  ]);
});

test("extractLinks: every extracted product link parses", () => {
  const blob =
    "a https://item.taobao.com/item.htm?id=1 b weidian.com/item.html?itemID=2 c";
  const parsed = extractLinks(blob).map((l) => parseLink(l));
  assert.deepEqual(parsed, [
    { marketplace: "taobao", id: "1" },
    { marketplace: "weidian", id: "2" },
  ]);
});

// --- Labels: the words written next to each link ---
const W = (id: number) => `https://weidian.com/item.html?itemID=${id}`;
const labels = (text: string) => extractLinkEntries(text).map((e) => e.label);

test("labels: written before the link", () => {
  assert.deepEqual(labels(`Stussy hoodie ${W(1)}\njeans: ${W(2)}`), ["Stussy hoodie", "jeans"]);
});

test("labels: written after the link", () => {
  assert.deepEqual(labels(`${W(1)} - Stussy hoodie\n${W(2)} → jeans`), ["Stussy hoodie", "jeans"]);
});

test("labels: several links on one line keep their own labels", () => {
  assert.deepEqual(labels(`hoodie ${W(1)} jeans ${W(2)}`), ["hoodie", "jeans"]);
  assert.deepEqual(labels(`${W(1)} hoodie, ${W(2)} jeans`), ["hoodie", "jeans"]);
});

test("labels: markdown link text (Reddit / pasted HTML)", () => {
  const e = extractLinkEntries(`Grails: [Travis 1s](${W(3)}) and [Carhartt jacket](${W(4)}).`);
  assert.deepEqual(e, [
    { url: W(3), label: "Travis 1s" },
    { url: W(4), label: "Carhartt jacket" },
  ]);
});

test("labels: a section heading labels the bare links under it", () => {
  const post = `**Jackets**\n- ${W(5)}\n- ${W(6)}\n\nThis is just me rambling about the haul for a bit\n- ${W(7)}\nShoes:\n* ${W(8)}`;
  assert.deepEqual(labels(post), ["Jackets", "Jackets", "", "Shoes"]);
});

test("labels: W2C prefixes, bullets and numbering are stripped", () => {
  assert.deepEqual(labels(`1. W2C: Stussy hoodie → ${W(1)}\n- W2C tee - ${W(2)}`), ["Stussy hoodie", "tee"]);
});

test("labels: filler words and bare URLs aren't labels", () => {
  assert.deepEqual(labels(`link: ${W(1)}\n${W(2)} here\n[${W(3)}](${W(3)})`), ["", "", ""]);
});

test("labels: spreadsheet rows (tab separated)", () => {
  assert.deepEqual(labels(`Nike Dunk Low\t${W(1)}\nBapesta\t${W(2)}`), ["Nike Dunk Low", "Bapesta"]);
});

test("labels: a duplicate link keeps the first real label", () => {
  const e = extractLinkEntries(`${W(1)}\nhoodie ${W(1)}`);
  assert.deepEqual(e, [{ url: W(1), label: "hoodie" }]);
});

test("cleanLabel: trims separators and caps length", () => {
  assert.equal(cleanLabel("  **Hoodie** — "), "Hoodie");
  assert.equal(cleanLabel("x".repeat(120)).length, 80);
});

// --- All of Jadeship's agents, with real formats ---

test("agents: exactly Jadeship's list of 36", () => {
  const jadeship = [
    "superbuy", "wegobuy", "pandabuy", "sugargoo", "cssbuy", "hagobuy", "basetao",
    "kameymall", "cnfans", "ezbuycn", "hoobuy", "allchinabuy", "mulebuy",
    "eastmallbuy", "hubbuycn", "joyabuy", "orientdig", "oopbuy", "lovegobuy",
    "blikbuy", "hegobuy", "ponybuy", "panglobalbuy", "sifubuy", "loongbuy",
    "kakobuy", "acbuy", "joyagoo", "itaobuy", "usfans", "cnshopper", "hipobuy",
    "gtbuy", "fishgoo", "lolobuy", "litbuy",
  ];
  assert.deepEqual(AGENTS.map((a) => a.key).sort(), [...jadeship].sort());
});

test("agents: confirmed ones sort first", () => {
  const firstUnverified = AGENTS_SORTED.findIndex((a) => !a.verified);
  assert.ok(AGENTS_SORTED.slice(0, firstUnverified).every((a) => a.verified));
  assert.ok(AGENTS_SORTED.slice(firstUnverified).every((a) => !a.verified));
});

// Real formats (from a live open-source converter + real product links).
const real: [string, ParsedLink][] = [
  ["https://www.acbuy.com/product/?id=7212345678&source=WD&u=9MLILB", { marketplace: "weidian", id: "7212345678" }],
  ["https://www.acbuy.com/product/?id=654321&source=AL", { marketplace: "1688", id: "654321" }],
  ["https://www.acbuy.com/product/?id=678901234567&source=TB", { marketplace: "taobao", id: "678901234567" }],
  ["https://www.hoobuy.com/product/2/7212345678?utm_source=QX1Ke4G8", { marketplace: "weidian", id: "7212345678" }],
  ["https://www.hoobuy.com/product/0/654321", { marketplace: "1688", id: "654321" }],
  ["https://hoobuy.com/m/product/1/678901234567", { marketplace: "taobao", id: "678901234567" }],
  ["https://www.oopbuy.com/product/weidian/7212345678?inviteCode=DWBB8ZQ4U", { marketplace: "weidian", id: "7212345678" }],
  ["https://www.oopbuy.com/product/2/7212345678", { marketplace: "weidian", id: "7212345678" }],
  ["https://www.oopbuy.com/product/1/678901234567", { marketplace: "taobao", id: "678901234567" }],
  ["https://cnfans.com/product/?shop_type=ali_1688&id=654321&ref=71427", { marketplace: "1688", id: "654321" }],
  ["https://www.allchinabuy.com/en/page/buy/?from=search-input&url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7212345678&partnercode=wrf7xD", { marketplace: "weidian", id: "7212345678" }],
  ["https://cnshopper.com/goods/detail?keyword=769941872984&platform=1688&invite_id=1997618", { marketplace: "1688", id: "769941872984" }],
  ["https://cnshopper.com/goods/detail?keyword=1035221191373&platform=taobao&invite_id=1424233", { marketplace: "taobao", id: "1035221191373" }],
  // Your CSSBuy link — their newer page style
  ["https://www.cssbuy.com/shop/goodsDetail?type=micro&id=7832622051&promotionCode=dXVmaW5kcw", { marketplace: "weidian", id: "7832622051" }],
  // More marketplace shapes
  ["https://world.taobao.com/item/678901234567.htm", { marketplace: "taobao", id: "678901234567" }],
  ["https://k.youshop10.com/item.html?itemID=7212345678", { marketplace: "weidian", id: "7212345678" }],
];
for (const [url, want] of real) {
  test(`real link: ${url.slice(0, 70)}`, () => assert.deepEqual(parseLink(url), want));
}

test("real builds match the live formats exactly", () => {
  const wd = { marketplace: "weidian" as const, id: "7212345678" };
  assert.equal(buildAgentLink("acbuy", wd), "https://www.acbuy.com/product/?id=7212345678&source=WD");
  assert.equal(buildAgentLink("hoobuy", wd), "https://www.hoobuy.com/product/2/7212345678");
  assert.equal(buildAgentLink("oopbuy", wd), "https://www.oopbuy.com/product/weidian/7212345678");
  assert.equal(buildAgentLink("cnfans", wd), "https://cnfans.com/product/?id=7212345678&shop_type=weidian");
  assert.equal(
    buildAgentLink("kakobuy", wd),
    "https://www.kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7212345678",
  );
  // Base that already has a query string gets "&", not a second "?".
  assert.match(buildAgentLink("eastmallbuy", wd) ?? "", /searchlang=en&url=https%3A/);
});

test("safety net: an agent link in an unexpected shape still resolves", () => {
  // e.g. an agent changes its page but keeps a marketplace word + id.
  assert.deepEqual(parseLink("https://www.litbuy.com/products/details?id=7212345678&channel=weidian"), {
    marketplace: "weidian",
    id: "7212345678",
  });
  assert.deepEqual(parseLink("https://www.sifubuy.com/detail?url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F654321.html"), {
    marketplace: "1688",
    id: "654321",
  });
  assert.deepEqual(parseAgentGeneric(new URL("https://x.test/p/taobao/678901234567")), {
    marketplace: "taobao",
    id: "678901234567",
  });
  // …but it doesn't invent products from unrelated sites.
  assert.equal(parseLink("https://www.reddit.com/r/FashionReps/comments/1abc/?id=12345678"), null);
});

test("every agent has a working build for every marketplace", () => {
  const mps = ["taobao", "tmall", "weidian", "1688"] as const;
  for (const a of AGENTS) {
    for (const marketplace of mps) {
      const url = buildAgentLink(a.key, { marketplace, id: "7212345678" });
      assert.ok(url && /^https:\/\//.test(url), `${a.key}/${marketplace}`);
      assert.ok(AGENTS_BY_KEY[a.key]);
    }
  }
});

// --- Reverse: agent link → the original marketplace link ---
test("reverse: every agent link comes back to the clean original", () => {
  for (const agent of AGENTS) {
    for (const p of samples) {
      const back = parseLink(buildAgentLink(agent.key, p) as string);
      assert.ok(back, agent.key);
      assert.equal(marketplaceUrl(back.marketplace, back.id), marketplaceUrl(p.marketplace, p.id));
    }
  }
});

test("reverse: the user's CSSBuy link → the raw Weidian link", () => {
  const p = parseLink(
    "https://www.cssbuy.com/shop/goodsDetail?type=micro&id=7832622051&promotionCode=dXVmaW5kcw",
  );
  assert.ok(p);
  assert.equal(marketplaceUrl(p.marketplace, p.id), "https://weidian.com/item.html?itemID=7832622051");
});

test("reverse: a Tmall link wrapped by an agent stays Tmall", () => {
  const wrapped =
    "https://www.superbuy.com/en/page/buy/?url=" +
    encodeURIComponent("https://detail.tmall.com/item.htm?id=612345678901&spm=x");
  assert.deepEqual(parseLink(wrapped), { marketplace: "tmall", id: "612345678901" });
});

test("twinMarketplace: Taobao ⇄ Tmall only", () => {
  assert.equal(twinMarketplace("taobao"), "tmall");
  assert.equal(twinMarketplace("tmall"), "taobao");
  assert.equal(twinMarketplace("weidian"), null);
  assert.equal(twinMarketplace("1688"), null);
});

test("outputLink: raw gives the original, even for a saved agent link", () => {
  const p = parseLink("https://www.cssbuy.com/item-micro-7832622051.html")!;
  assert.equal(outputLink(RAW_KEY, p), "https://weidian.com/item.html?itemID=7832622051");
  assert.equal(outputLink("cnfans", p), "https://cnfans.com/product/?id=7832622051&shop_type=weidian");
  assert.equal(outputLink(null, p), null);
  assert.ok(!AGENTS.some((a) => a.key === RAW_KEY), "raw must never clash with a real agent");
});
