// The fixed reason tag set (plan section 1). Never free text — picked from this
// list. Required when a rank is set (enforced in the DB too, migration 0003).
export const REASONS = [
  "cheapest",
  "best photos",
  "good fabric",
  "responsive",
  "sample received",
  "low moq",
  "fast shipping",
  "most colors",
] as const;

export type Reason = (typeof REASONS)[number];

export const PHOTOS_BUCKET = "photos";

// Client-side resize targets (plan section 2). Bumped for crisper images —
// the full image is what detail/outfit views show, so it stays high quality;
// thumbnails are larger too so grids look sharp on retina screens.
export const FULL_MAX_EDGE = 2048;
export const FULL_QUALITY = 0.9;
export const THUMB_MAX_EDGE = 600;
export const THUMB_QUALITY = 0.82;
