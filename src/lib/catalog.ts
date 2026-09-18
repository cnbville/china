import type { SupabaseClient } from "@supabase/supabase-js";
import { makeVariants } from "./image";
import { PHOTOS_BUCKET } from "./constants";
import type { Category, Collection, ItemPhoto } from "./types";

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
 * the source and item_photos rows once the item row goes; the storage objects
 * behind every gallery photo (plus the cover) are gathered and removed here.
 */
export async function deleteItemFully(
  supabase: SupabaseClient,
  item: { id: string; photo_path: string | null; thumb_path: string | null },
): Promise<void> {
  const { data: photos } = await supabase
    .from("item_photos")
    .select("photo_path, thumb_path")
    .eq("item_id", item.id);

  const objects = new Set<string>();
  for (const p of (photos ?? []) as Pick<ItemPhoto, "photo_path" | "thumb_path">[]) {
    if (p.photo_path) objects.add(p.photo_path);
    if (p.thumb_path) objects.add(p.thumb_path);
  }
  if (item.photo_path) objects.add(item.photo_path);
  if (item.thumb_path) objects.add(item.thumb_path);

  if (objects.size > 0) {
    const { error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .remove([...objects]);
    if (error) throw error;
  }
  const { error } = await supabase.from("items").delete().eq("id", item.id);
  if (error) throw error;
}

/**
 * Upload one or more photos and append them to an item's gallery. If the item
 * has no cover yet, the first uploaded photo becomes the cover.
 */
export async function addPhotosToItem(
  supabase: SupabaseClient,
  item: { id: string; photo_path: string | null },
  existingCount: number,
  files: File[],
): Promise<void> {
  const uploaded: UploadedPhoto[] = [];
  for (const f of files) uploaded.push(await uploadPhoto(supabase, item.id, f));

  const rows = uploaded.map((u, i) => ({
    item_id: item.id,
    photo_path: u.photo_path,
    thumb_path: u.thumb_path,
    position: existingCount + i,
  }));
  const { error } = await supabase.from("item_photos").insert(rows);
  if (error) throw error;

  if (!item.photo_path && uploaded[0]) {
    await supabase
      .from("items")
      .update({
        photo_path: uploaded[0].photo_path,
        thumb_path: uploaded[0].thumb_path,
      })
      .eq("id", item.id);
  }
}

/** Remove one gallery photo. If it was the cover, promote the next one. */
export async function removeItemPhoto(
  supabase: SupabaseClient,
  item: { id: string; photo_path: string | null },
  photo: ItemPhoto,
  gallery: ItemPhoto[],
): Promise<void> {
  const objects = [photo.photo_path, photo.thumb_path].filter(Boolean);
  if (objects.length > 0) {
    const { error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .remove(objects);
    if (error) throw error;
  }
  const { error } = await supabase.from("item_photos").delete().eq("id", photo.id);
  if (error) throw error;

  // Was this the cover? Promote the next remaining photo (or clear it).
  if (item.photo_path === photo.photo_path) {
    const next = gallery.find((p) => p.id !== photo.id) ?? null;
    await supabase
      .from("items")
      .update({
        photo_path: next?.photo_path ?? null,
        thumb_path: next?.thumb_path ?? null,
      })
      .eq("id", item.id);
  }
}

/** Make an existing gallery photo the item's cover (what grids show). */
export async function setItemCover(
  supabase: SupabaseClient,
  itemId: string,
  photo: ItemPhoto,
): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update({ photo_path: photo.photo_path, thumb_path: photo.thumb_path })
    .eq("id", itemId);
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
