"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl, getSignedUrls } from "@/lib/signedUrls";
import {
  addPhotosToItem,
  removeItemPhoto,
  setItemCover,
} from "@/lib/catalog";
import type { Item, ItemPhoto } from "@/lib/types";

// The item's photo gallery: a big active image, a strip of thumbnails, and
// controls to add more, set the cover, or remove one. The cover is whichever
// photo matches item.photo_path (what the grids show).
export function ItemPhotos({
  item,
  photos,
  supabase,
  refetch,
}: {
  item: Item;
  photos: ItemPhoto[];
  supabase: ReturnType<typeof createClient>;
  refetch: () => Promise<void>;
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [mainUrl, setMainUrl] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The photo currently shown large: the selected one, else the cover, else first.
  const active = useMemo(() => {
    if (photos.length === 0) return null;
    return (
      photos.find((p) => p.id === activeId) ??
      photos.find((p) => p.photo_path === item.photo_path) ??
      photos[0]
    );
  }, [photos, activeId, item.photo_path]);

  useEffect(() => {
    getSignedUrls(
      supabase,
      photos.map((p) => p.thumb_path),
    )
      .then(setThumbs)
      .catch(() => {});
  }, [photos, supabase]);

  useEffect(() => {
    getSignedUrl(supabase, active?.photo_path ?? null)
      .then(setMainUrl)
      .catch(() => {});
  }, [active?.photo_path, supabase]);

  async function onAdd(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setBusy(true);
    try {
      await addPhotosToItem(supabase, item, photos.length, files);
      await refetch();
    } catch (e) {
      alert(`Couldn’t add photos: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(photo: ItemPhoto) {
    if (!confirm("Remove this photo?")) return;
    setBusy(true);
    try {
      await removeItemPhoto(supabase, item, photo, photos);
      if (activeId === photo.id) setActiveId(null);
      await refetch();
    } catch (e) {
      alert(`Couldn’t remove: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSetCover(photo: ItemPhoto) {
    setBusy(true);
    try {
      await setItemCover(supabase, item.id, photo);
      await refetch();
    } catch (e) {
      alert(`Couldn’t set cover: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const isCover = (p: ItemPhoto) => p.photo_path === item.photo_path;

  return (
    <div>
      <div className="photo-frame rounded-card border border-line shadow-lift">
        {mainUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainUrl} alt={item.title} />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-full w-full items-center justify-center text-meta text-muted"
          >
            {photos.length === 0 ? "Add a photo" : "no photo"}
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveId(p.id)}
                className={
                  "block h-16 w-[3.2rem] overflow-hidden rounded-[6px] border bg-[#05060a] transition-colors " +
                  (active?.id === p.id
                    ? "border-accent"
                    : "border-line hover:border-accent/50")
                }
              >
                {thumbs[p.thumb_path] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[p.thumb_path]}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
              {isCover(p) && (
                <span className="pointer-events-none absolute left-0.5 top-0.5 rounded-pill bg-accent px-1 py-px text-[9px] font-medium text-white">
                  Cover
                </span>
              )}
              {/* Hover controls */}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 pb-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {!isCover(p) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSetCover(p)}
                    title="Make cover"
                    className="rounded-pill bg-black/70 px-1.5 text-[9px] text-white backdrop-blur hover:bg-black/90 disabled:opacity-50"
                  >
                    Cover
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(p)}
                  title="Remove photo"
                  className="rounded-full bg-black/70 p-0.5 text-white backdrop-blur hover:bg-accent disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-2.5 w-2.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Add photos"
            className="flex h-16 w-[3.2rem] items-center justify-center rounded-[6px] border border-dashed border-line text-xl text-muted transition-colors hover:border-accent hover:text-ink disabled:opacity-50"
          >
            +
          </button>
        </div>
      )}

      {photos.length === 0 && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost mt-3 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Add photos"}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
