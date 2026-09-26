import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENTS,
  buildAgentLink,
  detectAgent,
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
