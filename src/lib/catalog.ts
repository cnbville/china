import type { SupabaseClient } from "@supabase/supabase-js";
import { makeVariants } from "./image";
import { PHOTOS_BUCKET } from "./constants";
import type { Category, Collection } from "./types";

// Find an existing collection/category by name (case-insensitive), or create it.
// Keeps the single user from accumulating near-duplicate "Hoodies"/"hoodies".
async function findOrCreate(
  supabase: SupabaseClient,
  table: "collections" | "categories",
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const { data: existing, error: findErr } = await supabase
    .from(table)
    .select("id, name")
    .ilike("name", trimmed)
    .limit(1);
  if (findErr) throw findErr;
  if (existing && existing.length > 0) return existing[0].id as string;

  const { data: created, error: insErr } = await supabase
    .from(table)
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id as string;
}

export async function resolveCollectionId(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  if (!name.trim()) return null;
  return findOrCreate(supabase, "collections", name);
}

export async function resolveCategoryId(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  if (!name.trim()) return null;
  return findOrCreate(supabase, "categories", name);
}

export async function listCollections(
  supabase: SupabaseClient,
): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Rename a collection. Trims and rejects an empty name. Returns the new name so
 * callers can reflect it without a refetch.
 */
export async function renameCollection(
  supabase: SupabaseClient,
  id: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A collection needs a name.");
  const { error } = await supabase
    .from("collections")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) throw error;
  return trimmed;
}

/**
 * Delete a collection. Its items are NOT deleted — the `on delete set null` FK
 * unfiles them, so they return to the main feed. Also clears any notepad note
 * scoped to this collection so it doesn't linger as an orphan.
 */
export async function deleteCollection(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
  // Best-effort: drop the collection-scoped note (no-op if none exists).
  await supabase.from("notes").delete().eq("key", `collection:${id}`);
}

export async function listCategories(
  supabase: SupabaseClient,
): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Delete an item and its links. Storage objects are removed FIRST, then the row
 * (plan section 2): a failure then leaves a row with a broken image — visible and
 * fixable — rather than an invisible orphaned file. `on delete cascade` handles
 * the source rows once the item row goes.
 */
export async function deleteItemFully(
  supabase: SupabaseClient,
  item: { id: string; photo_path: string | null; thumb_path: string | null },
): Promise<void> {
  const objects = [item.photo_path, item.thumb_path].filter(
    (p): p is string => !!p,
  );
  if (objects.length > 0) {
    const { error } = await supabase.storage.from(PHOTOS_BUCKET).remove(objects);
    if (error) throw error;
  }
  const { error } = await supabase.from("items").delete().eq("id", item.id);
  if (error) throw error;
}

export type UploadedPhoto = { photo_path: string; thumb_path: string };

/**
 * Resize an original image to full + thumb WebP and upload both straight to
 * Storage from the browser (plan section 2). Objects live at
 * items/{itemId}/{uuid}.webp.
 */
export async function uploadPhoto(
  supabase: SupabaseClient,
  itemId: string,
  original: Blob,
): Promise<UploadedPhoto> {
  const { full, thumb } = await makeVariants(original);
  const uuid = crypto.randomUUID();
  const photo_path = `items/${itemId}/${uuid}.webp`;
  const thumb_path = `items/${itemId}/${uuid}_thumb.webp`;

  const storage = supabase.storage.from(PHOTOS_BUCKET);
  const [fullRes, thumbRes] = await Promise.all([
    storage.upload(photo_path, full, { contentType: "image/webp", upsert: true }),
    storage.upload(thumb_path, thumb, {
      contentType: "image/webp",
      upsert: true,
    }),
  ]);
  if (fullRes.error) throw fullRes.error;
  if (thumbRes.error) throw thumbRes.error;

  return { photo_path, thumb_path };
}
