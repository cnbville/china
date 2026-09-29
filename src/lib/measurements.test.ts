import { test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_TEMPLATES, groupOf, labelKey, templateFor } from "./measurements";
import type { Measurement, MeasurementSet } from "./types";

const set = (id: string, kind: MeasurementSet["kind"], garment_type: string | null): MeasurementSet =>
  ({ id, kind, name: id, garment_type, item_id: null, notes: null, created_at: "" }) as MeasurementSet;
const rows = (setId: string, labels: string[]): Measurement[] =>
  labels.map((label, i) => ({ id: `${setId}-${i}`, set_id: setId, label, value_cm: null, position: i, created_at: "" }) as Measurement);

test("groupOf: legacy Top/Bottom fold into Shirts/Pants", () => {
  assert.equal(groupOf("Top"), "Shirts");
  assert.equal(groupOf("Bottom"), "Pants");
  assert.equal(groupOf("Jackets"), "Jackets");
  assert.equal(groupOf(null), "Other");
  assert.equal(groupOf("Hats"), "Other");
});

test("templateFor: defaults when you have nothing yet", () => {
  assert.deepEqual(templateFor("body", null), FIELD_TEMPLATES.Body);
  assert.deepEqual(templateFor("reference", "Pants"), FIELD_TEMPLATES.Pants);
});

test("templateFor: your own body profile is the body template", () => {
  const sets = [set("b", "body", null)];
  const fields = { b: rows("b", ["Height", "Weight", "Chest", "Neck"]) };
  assert.deepEqual(templateFor("body", null, sets, fields), ["Height", "Weight", "Chest", "Neck"]);
});

test("templateFor: your fit reference beats items and defaults", () => {
  const sets = [set("i1", "item", "Shirts"), set("r", "reference", "Top")];
  const fields = { i1: rows("i1", ["A"]), r: rows("r", ["Pit to pit", "Length", "Shoulder"]) };
  assert.deepEqual(templateFor("item", "Shirts", sets, fields), ["Pit to pit", "Length", "Shoulder"]);
});

test("templateFor: a new jacket borrows your shirt fields (same family), not pants", () => {
  const sets = [set("p", "reference", "Pants"), set("s", "reference", "Shirts")];
  const fields = { p: rows("p", ["Waist"]), s: rows("s", ["Chest", "Length"]) };
  assert.deepEqual(templateFor("reference", "Jackets", sets, fields), ["Chest", "Length"]);
  assert.deepEqual(templateFor("reference", "Shorts", sets, fields), ["Waist"]);
});

test("labelKey: ignores brackets, case and punctuation", () => {
  assert.equal(labelKey("Chest (pit-to-pit)"), labelKey("chest"));
  assert.equal(labelKey("Sleeve-length"), labelKey("sleeve length"));
});

test("default tops template is the user's own Neck Up fields", () => {
  const want = ["Chest (pit-to-pit)", "Shoulder", "Length", "Sleeve length", "Sleeve opening", "Neck width"];
  for (const g of ["Shirts", "Hoodies & sweaters", "Jackets", "Top"]) assert.deepEqual(templateFor("reference", g), want);
});
