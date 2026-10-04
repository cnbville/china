import { test } from "node:test";
import assert from "node:assert/strict";
import { doppelQueries, doppelSearchUrl, queryKind, readDoppelHash } from "./doppel";

const p = { marketplace: "weidian" as const, id: "7832622051" };

test("doppelQueries: link, item number, then name — or name first when asked", () => {
  assert.deepEqual(doppelQueries(p, "Boxy tee"), [
    "https://weidian.com/item.html?itemID=7832622051",
    "7832622051",
    "Boxy tee",
  ]);
  assert.deepEqual(doppelQueries(p, "  Boxy   tee ", true)[0], "Boxy tee");
  assert.deepEqual(doppelQueries(null, "Arc jacket"), ["Arc jacket"]);
  assert.deepEqual(doppelQueries(null, ""), []);
});

test("doppelSearchUrl ↔ readDoppelHash round-trip", () => {
  const url = doppelSearchUrl(["a b", "123456"], "Boxy tee");
  assert.ok(url.startsWith("https://doppel.fit/#pc-search="));
  assert.deepEqual(readDoppelHash(new URL(url).hash), { q: ["a b", "123456"], label: "Boxy tee" });
  assert.equal(doppelSearchUrl([]), "https://doppel.fit/");
  assert.equal(readDoppelHash("#nothing"), null);
  assert.equal(readDoppelHash("#pc-search=%7Bbroken"), null);
});

test("queryKind", () => {
  assert.equal(queryKind("https://weidian.com/item.html?itemID=1"), "Link");
  assert.equal(queryKind("7832622051"), "Item #");
  assert.equal(queryKind("Boxy tee"), "Name");
});
