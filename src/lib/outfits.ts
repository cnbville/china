import type { SupabaseClient } from "@supabase/supabase-js";
import { makeVariants } from "./image";
import { PHOTOS_BUCKET } from "./constants";
import type { ItemCard, Outfit, OutfitPiece } from "./types";

// The fixed slot set for the "Slots" view. Accessory can hold several pieces;
// the rest are one-per-slot by convention.
export const OUTFIT_SLOTS = [
  "outerwear",
  "top",
  "bottom",
  "shoes",
  "accessory",
] as const;
export type OutfitSlot = (typeof OUTFIT_SLOTS)[number];

export async function listOutfits(supabase: SupabaseClient): Promise<Outfit[]> {
  const { data, error } = await supabase
    .from("outfits")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Outfit[];
}

/** All pieces across all outfits, for the list page's covers + totals. */
export async function listAllPieces(
  supabase: SupabaseClient,
): Promise<OutfitPiece[]> {
  const { data, error } = await supabase
    .from("outfit_pieces")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as OutfitPiece[];
}

export async function getOutfit(
  supabase: SupabaseClient,
  id: string,
): Promise<{ outfit: Outfit; pieces: OutfitPiece[] }> {
  const [oRes, pRes] = await Promise.all([
    supabase.from("outfits").select("*").eq("id", id).single(),
    supabase
      .from("outfit_pieces")
      .select("*")
      .eq("outfit_id", id)
      .order("sort_order"),
  ]);
  if (oRes.error) throw oRes.error;
  if (pRes.error) throw pRes.error;
  return {
    outfit: oRes.data as Outfit,
    pieces: (pRes.data ?? []) as OutfitPiece[],
  };
}

export async function createOutfit(
  supabase: SupabaseClient,
): Promise<Outfit> {
  const { data, error } = await supabase
    .from("outfits")
    .insert({})
    .select("*")
    .single();
  if (error) throw error;
  return data as Outfit;
}

export async function updateOutfit(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<Outfit, "name" | "season" | "notes">>,
): Promise<void> {
  const { error } = await supabase.from("outfits").update(patch).eq("id", id);
  if (error) throw error;
}

/** Delete an outfit; also clears any placeholder photos it held from storage. */
export async function deleteOutfit(
  supabase: SupabaseClient,
  id: string,
  pieces: OutfitPiece[],
): Promise<void> {
  const objects = pieces
    .flatMap((p) => [p.photo_path, p.thumb_path])
    .filter((p): p is string => !!p);
  if (objects.length > 0) {
    await supabase.storage.from(PHOTOS_BUCKET).remove(objects);
  }
  const { error } = await supabase.from("outfits").delete().eq("id", id);
  if (error) throw error;
}

// Stagger new pieces on the canvas so they don't pile up exactly.
function nextCanvasSpot(count: number): { x: number; y: number } {
  return { x: 28 + ((count * 13) % 44), y: 26 + ((count * 11) % 40) };
}

export async function addCatalogPiece(
  supabase: SupabaseClient,
  outfitId: string,
  item: ItemCard,
  order: number,
): Promise<OutfitPiece> {
  const spot = nextCanvasSpot(order);
  const { data, error } = await supabase
    .from("outfit_pieces")
    .insert({
      outfit_id: outfitId,
      item_id: item.id,
      sort_order: order,
      z: order,
      x: spot.x,
      y: spot.y,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OutfitPiece;
}

export async function addPlaceholderPiece(
  supabase: SupabaseClient,
  outfitId: string,
  label: string,
  order: number,
  photo: Blob | null,
): Promise<OutfitPiece> {
  let photo_path: string | null = null;
  let thumb_path: string | null = null;
  if (photo) {
    const { full, thumb } = await makeVariants(photo);
    const uuid = crypto.randomUUID();
    photo_path = `outfits/${outfitId}/${uuid}.webp`;
    thumb_path = `outfits/${outfitId}/${uuid}_thumb.webp`;
    const storage = supabase.storage.from(PHOTOS_BUCKET);
    const [f, t] = await Promise.all([
      storage.upload(photo_path, full, { contentType: "image/webp", upsert: true }),
      storage.upload(thumb_path, thumb, { contentType: "image/webp", upsert: true }),
    ]);
    if (f.error) throw f.error;
    if (t.error) throw t.error;
  }
  const spot = nextCanvasSpot(order);
  const { data, error } = await supabase
    .from("outfit_pieces")
    .insert({
      outfit_id: outfitId,
      placeholder_label: label.trim() || "Placeholder",
      photo_path,
      thumb_path,
      sort_order: order,
      z: order,
      x: spot.x,
      y: spot.y,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OutfitPiece;
}

export async function updatePiece(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      OutfitPiece,
      "slot" | "sort_order" | "x" | "y" | "scale" | "rotation" | "z"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("outfit_pieces")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function removePiece(
  supabase: SupabaseClient,
  piece: OutfitPiece,
): Promise<void> {
  const objects = [piece.photo_path, piece.thumb_path].filter(
    (p): p is string => !!p,
  );
  if (objects.length > 0) {
    await supabase.storage.from(PHOTOS_BUCKET).remove(objects);
  }
  const { error } = await supabase
    .from("outfit_pieces")
    .delete()
    .eq("id", piece.id);
  if (error) throw error;
}
