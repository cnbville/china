import type { SupabaseClient } from "@supabase/supabase-js";
import type { Measurement, MeasurementKind, MeasurementSet } from "./types";

// Garment groups — the page is organised by these (shirts with shirts, jackets
// with jackets, pants with pants). Stored in measurement_sets.garment_type.
export const GARMENT_TYPES = ["Shirts", "Hoodies & sweaters", "Jackets", "Pants", "Shorts"] as const;
export type GarmentType = (typeof GARMENT_TYPES)[number] | "Other";

const TOPS = ["Shirts", "Hoodies & sweaters", "Jackets"];
const BOTTOMS = ["Pants", "Shorts"];

// Sets made before the groups existed were "Top" / "Bottom".
const LEGACY: Record<string, GarmentType> = { Top: "Shirts", Bottom: "Pants" };

/** Which group a set belongs to (legacy Top/Bottom fold into Shirts/Pants). */
export function groupOf(type: string | null | undefined): GarmentType {
  if (!type) return "Other";
  if (LEGACY[type]) return LEGACY[type];
  return (GARMENT_TYPES as readonly string[]).includes(type) ? (type as GarmentType) : "Other";
}

function familyOf(g: GarmentType): "tops" | "bottoms" | null {
  return TOPS.includes(g) ? "tops" : BOTTOMS.includes(g) ? "bottoms" : null;
}

// Default field sets, only used until you have measurements of your own (all
// cm, flat-lay for garments — how 1688/Taobao size charts are given).
// Tops follow YOUR "Neck Up" card: its fields, in its order.
const TOP_FIELDS = ["Chest (pit-to-pit)", "Shoulder", "Length", "Sleeve length", "Sleeve opening", "Neck width"];
const BOTTOM_FIELDS = ["Waist", "Hip", "Thigh", "Inseam", "Front rise", "Leg opening", "Total length"];
export const FIELD_TEMPLATES: Record<string, string[]> = {
  Shirts: TOP_FIELDS,
  "Hoodies & sweaters": TOP_FIELDS,
  Jackets: TOP_FIELDS,
  Pants: BOTTOM_FIELDS,
  Shorts: BOTTOM_FIELDS,
  Other: TOP_FIELDS,
  Body: ["Height", "Chest", "Waist", "Hip", "Shoulder", "Arm length", "Inseam"],
};

/** Which template slot a set fills: "Body", or its garment group. */
export function templateSlot(s: Pick<MeasurementSet, "kind" | "garment_type">): string {
  return s.kind === "body" ? "Body" : groupOf(s.garment_type);
}

/**
 * The fields a new set starts with. A card you marked "template" for that
 * group wins (`chosen`: slot → set id). Otherwise YOUR measurements are the template: the
 * labels (and order) of your own existing set win over the defaults —
 *   body    → your body profile
 *   garment → a fit reference of that type, then any set of that type, then
 *             one from the same family (tops / bottoms), then the defaults.
 */
export function templateFor(
  kind: MeasurementKind,
  type: string | null | undefined,
  sets: MeasurementSet[] = [],
  fields: Record<string, Measurement[]> = {},
  chosen: Record<string, string> = {},
): string[] {
  const labelsOf = (s: MeasurementSet) =>
    (fields[s.id] ?? []).map((m) => m.label.trim()).filter(Boolean);
  const firstWith = (cands: MeasurementSet[]) => {
    for (const s of cands) {
      const l = labelsOf(s);
      if (l.length) return l;
    }
    return null;
  };
  const picked = (slot: string) => sets.filter((s) => s.id === chosen[slot]);
  if (kind === "body") {
    return (
      firstWith(picked("Body")) ??
      firstWith(sets.filter((s) => s.kind === "body")) ??
      FIELD_TEMPLATES.Body
    );
  }
  const g = groupOf(type);
  const mine = firstWith(picked(g));
  if (mine) return mine;
  const garments = sets.filter((s) => s.kind !== "body");
  const same = garments.filter((s) => groupOf(s.garment_type) === g);
  const fam = familyOf(g);
  const kin = fam ? garments.filter((s) => familyOf(groupOf(s.garment_type)) === fam) : [];
  const refsFirst = (xs: MeasurementSet[]) => [
    ...xs.filter((s) => s.kind === "reference"),
    ...xs.filter((s) => s.kind !== "reference").reverse(), // newest item first
  ];
  // A template you picked for a sibling group (e.g. Shirts → a new Jacket).
  const kinPicked = fam
    ? GARMENT_TYPES.filter((x) => x !== g && familyOf(x) === fam).flatMap((x) => picked(x))
    : [];
  return (
    firstWith(refsFirst(same)) ??
    firstWith(kinPicked) ??
    firstWith(refsFirst(kin)) ??
    FIELD_TEMPLATES[g] ??
    TOP_FIELDS
  );
}

/** Normalised label, so "Chest (pit-to-pit)" matches "chest" for comparisons. */
export function labelKey(label: string): string {
  return label.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function loadMeasurements(supabase: SupabaseClient): Promise<{
  sets: MeasurementSet[];
  fields: Record<string, Measurement[]>;
}> {
  const [setsRes, msRes] = await Promise.all([
    supabase.from("measurement_sets").select("*").order("created_at"),
    supabase.from("measurements").select("*").order("position"),
  ]);
  if (setsRes.error) throw setsRes.error;
  if (msRes.error) throw msRes.error;
  const fields: Record<string, Measurement[]> = {};
  for (const m of (msRes.data ?? []) as Measurement[]) {
    (fields[m.set_id] ??= []).push(m);
  }
  return { sets: (setsRes.data ?? []) as MeasurementSet[], fields };
}

export async function createSet(
  supabase: SupabaseClient,
  s: {
    kind: MeasurementKind;
    name: string;
    garment_type?: string | null;
    item_id?: string | null;
    labels?: string[];
  },
): Promise<MeasurementSet> {
  const { data, error } = await supabase
    .from("measurement_sets")
    .insert({
      kind: s.kind,
      name: s.name,
      garment_type: s.garment_type ?? null,
      item_id: s.item_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  const labels = s.labels ?? [];
  if (labels.length > 0) {
    const rows = labels.map((label, i) => ({
      set_id: (data as MeasurementSet).id,
      label,
      value_cm: null,
      position: i,
    }));
    const { error: e2 } = await supabase.from("measurements").insert(rows);
    if (e2) throw e2;
  }
  return data as MeasurementSet;
}

export async function setGarmentType(
  supabase: SupabaseClient,
  id: string,
  garment_type: string,
): Promise<void> {
  const { error } = await supabase.from("measurement_sets").update({ garment_type }).eq("id", id);
  if (error) throw error;
}

export async function renameSet(
  supabase: SupabaseClient,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from("measurement_sets")
    .update({ name: name.trim() || "Untitled" })
    .eq("id", id);
  if (error) throw error;
}

export async function setNotes(
  supabase: SupabaseClient,
  id: string,
  notes: string,
): Promise<void> {
  const { error } = await supabase
    .from("measurement_sets")
    .update({ notes: notes.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSet(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("measurement_sets").delete().eq("id", id);
  if (error) throw error;
}

export async function addField(
  supabase: SupabaseClient,
  setId: string,
  label: string,
  position: number,
): Promise<Measurement> {
  const { data, error } = await supabase
    .from("measurements")
    .insert({ set_id: setId, label: label || "New", value_cm: null, position })
    .select("*")
    .single();
  if (error) throw error;
  return data as Measurement;
}

export async function updateField(
  supabase: SupabaseClient,
  id: string,
  patch: { label?: string; value_cm?: number | null },
): Promise<void> {
  const { error } = await supabase.from("measurements").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeField(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw error;
}
