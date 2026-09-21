import type { SupabaseClient } from "@supabase/supabase-js";
import type { Measurement, MeasurementKind, MeasurementSet } from "./types";

// Default field sets, so a new profile starts with the measurements that matter
// (all cm, flat-lay for garments — how 1688/Taobao size charts are given).
export const FIELD_TEMPLATES: Record<string, string[]> = {
  Top: [
    "Chest (pit-to-pit)",
    "Shoulder",
    "Length",
    "Sleeve length",
    "Sleeve opening",
    "Hem width",
  ],
  Bottom: [
    "Waist",
    "Hip",
    "Thigh",
    "Inseam",
    "Front rise",
    "Leg opening",
    "Total length",
  ],
  Body: ["Height", "Chest", "Waist", "Hip", "Shoulder", "Arm length", "Inseam"],
};

// The garment types offered for reference / item profiles (each maps to a
// template above; anything not listed falls back to the Top fields).
export const GARMENT_TYPES = ["Top", "Bottom"] as const;

export function templateFor(type: string | null | undefined): string[] {
  if (type && FIELD_TEMPLATES[type]) return FIELD_TEMPLATES[type];
  return FIELD_TEMPLATES.Top;
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
