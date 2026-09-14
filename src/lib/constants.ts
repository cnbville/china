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

// Client-side resize targets (plan section 2).
export const FULL_MAX_EDGE = 1600;
export const FULL_QUALITY = 0.8;
export const THUMB_MAX_EDGE = 400;
export const THUMB_QUALITY = 0.7;
