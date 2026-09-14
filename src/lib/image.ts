import {
  FULL_MAX_EDGE,
  FULL_QUALITY,
  THUMB_MAX_EDGE,
  THUMB_QUALITY,
} from "./constants";

// Client-side image resizing on a canvas before upload (plan section 2).
// Resizing is about the grid: a category page pulling forty 400px thumbnails
// opens instantly; one pulling forty originals does not.

async function toBitmap(source: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(source);
}

function scaledSize(w: number, h: number, maxEdge: number) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { w, h }; // never upscale
  const ratio = maxEdge / longest;
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) };
}

async function resizeToWebp(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): Promise<Blob> {
  const { w, h } = scaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Failed to encode WebP");
  return blob;
}

export type ResizedImage = {
  full: Blob; // longest edge <= 1600, WebP q80
  thumb: Blob; // 400px, WebP q70 — what the grid loads
};

/** Produce the full + thumb WebP blobs from an original image file/blob. */
export async function makeVariants(source: Blob): Promise<ResizedImage> {
  const bitmap = await toBitmap(source);
  try {
    const [full, thumb] = await Promise.all([
      resizeToWebp(bitmap, FULL_MAX_EDGE, FULL_QUALITY),
      resizeToWebp(bitmap, THUMB_MAX_EDGE, THUMB_QUALITY),
    ]);
    return { full, thumb };
  } finally {
    bitmap.close();
  }
}

/**
 * Pull the first image out of a clipboard/drag DataTransfer or paste event.
 * Paste is the primary path — most images come from copying out of a listing.
 */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(dt.files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}
