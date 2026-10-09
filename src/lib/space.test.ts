import { test } from "node:test";
import assert from "node:assert/strict";
import { guessSpace, inSpace, noteKey, spaceRow } from "./space";

test("guessSpace: reads PC parts and clothes from listing titles (zh + en)", () => {
  assert.equal(guessSpace("七彩虹 RTX 4070 SUPER 显卡 12G"), "pc");
  assert.equal(guessSpace("Kingston FURY DDR5 6000 32GB 内存条"), "pc");
  assert.equal(guessSpace("微星 B650M 主板 AM5"), "pc");
  assert.equal(guessSpace("重磅 oversize 卫衣 hoodie 男"), "clothes");
  assert.equal(guessSpace("Boxy heavyweight tee"), "clothes");
  assert.equal(guessSpace(""), null);
  assert.equal(guessSpace("item 12345"), null);
});

test("inSpace / spaceRow / noteKey: no-ops before the migration (space = null)", () => {
  const calls: string[][] = [];
  const q = { eq(c: string, v: string) { calls.push([c, v]); return q; } };
  inSpace(q, null);
  assert.deepEqual(calls, []);
  inSpace(q, "pc");
  assert.deepEqual(calls, [["space", "pc"]]);
  assert.deepEqual(spaceRow(null), {});
  assert.deepEqual(spaceRow("clothes"), { space: "clothes" });
  assert.equal(noteKey("general", "clothes"), "general");
  assert.equal(noteKey("general", null), "general");
  assert.equal(noteKey("general", "pc"), "pc:general");
});
