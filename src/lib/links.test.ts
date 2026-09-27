import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  buildAgentLink,
  detectAgent,
  cleanLabel,
  extractLinkEntries,
  extractLinks,
  parseLink,
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
