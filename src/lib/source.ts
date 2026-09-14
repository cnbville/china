import type { Source } from "./types";

// Form-side representation of a source. Numbers are kept as strings while typing
// and coerced on save.
export type SourceDraft = {
  url: string;
  seller_name: string;
  price: string;
  moq: string;
  colors: string[];
  sizes: string[];
  rank: string;
  reasons: string[];
  notes: string;
};

export const emptySourceDraft: SourceDraft = {
  url: "",
  seller_name: "",
  price: "",
  moq: "",
  colors: [],
  sizes: [],
  rank: "",
  reasons: [],
  notes: "",
};

export function draftFromSource(s: Source): SourceDraft {
  return {
    url: s.url,
    seller_name: s.seller_name ?? "",
    price: s.price != null ? String(s.price) : "",
    moq: s.moq != null ? String(s.moq) : "",
    colors: s.colors ?? [],
    sizes: s.sizes ?? [],
    rank: s.rank != null ? String(s.rank) : "",
    reasons: s.reasons ?? [],
    notes: s.notes ?? "",
  };
}

/**
 * Sort order for the item view: by rank, unranked falling to the bottom ordered
 * by price (plan section 5). Nulls sort last within each group.
 */
export function compareSources(a: Source, b: Source): number {
  const ar = a.rank ?? Infinity;
  const br = b.rank ?? Infinity;
  if (ar !== br) return ar - br;
  // Same rank bucket (usually both unranked): cheaper first, no-price last.
  const ap = a.price ?? Infinity;
  const bp = b.price ?? Infinity;
  if (ap !== bp) return ap - bp;
  return a.created_at.localeCompare(b.created_at);
}

export type SourcePayload = {
  url: string;
  seller_name: string | null;
  price: number | null;
  moq: number | null;
  colors: string[];
  sizes: string[];
  rank: number | null;
  reasons: string[];
  notes: string | null;
};

/** Validate + coerce a draft to a DB payload, or return an error message. */
export function draftToPayload(
  d: SourceDraft,
): { ok: true; value: SourcePayload } | { ok: false; error: string } {
  const url = d.url.trim();
  if (!url) return { ok: false, error: "A source needs a URL." };

  const rank = d.rank.trim() === "" ? null : Number(d.rank);
  if (rank != null && (!Number.isInteger(rank) || rank < 1)) {
    return { ok: false, error: "Rank must be a whole number, 1 or higher." };
  }
  // Mirrors the DB constraint: reasons required when a rank is set.
  if (rank != null && d.reasons.length === 0) {
    return { ok: false, error: "Pick at least one reason for a ranked source." };
  }

  const price = d.price.trim() === "" ? null : Number(d.price);
  if (price != null && (Number.isNaN(price) || price < 0)) {
    return { ok: false, error: "Price must be a positive number (CNY)." };
  }

  const moq = d.moq.trim() === "" ? null : Number(d.moq);
  if (moq != null && (!Number.isInteger(moq) || moq < 0)) {
    return { ok: false, error: "MOQ must be a whole number." };
  }

  return {
    ok: true,
    value: {
      url,
      seller_name: d.seller_name.trim() || null,
      price,
      moq,
      colors: d.colors,
      sizes: d.sizes,
      rank,
      reasons: d.reasons,
      notes: d.notes.trim() || null,
    },
  };
}
