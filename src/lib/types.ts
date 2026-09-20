// Hand-written row types matching the schema in supabase/migrations. Kept simple
// and explicit rather than generated, at this scale.

export type Collection = {
  id: string;
  name: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
};

export type Item = {
  id: string;
  title: string;
  photo_path: string | null;
  thumb_path: string | null;
  type: string | null;
  brand: string | null;
  collection_id: string | null;
  category_id: string | null;
  liked: boolean;
  wanted: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Source = {
  id: string;
  item_id: string;
  url: string;
  seller_name: string | null;
  price: number | null;
  moq: number | null;
  colors: string[];
  sizes: string[];
  rank: number | null;
  reasons: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// The item_cards view (migration 0004): items plus rolled-up source stats.
export type ItemCard = Item & {
  lead_price: number | null;
  source_count: number;
  color_count: number;
};

// One photo in an item's gallery (migration 0009). The item's cover is whichever
// of these matches items.photo_path / items.thumb_path.
export type ItemPhoto = {
  id: string;
  item_id: string;
  photo_path: string;
  thumb_path: string;
  position: number;
  created_at: string;
};

// An outfit and its pieces (migration 0010, the Outfit Creator).
export type Outfit = {
  id: string;
  name: string;
  season: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// One piece in an outfit: either a catalog item (item_id set) or a placeholder
// (placeholder_label set). Carries layout for all three views.
export type OutfitPiece = {
  id: string;
  outfit_id: string;
  item_id: string | null;
  placeholder_label: string | null;
  photo_path: string | null;
  thumb_path: string | null;
  // A specific photo of the catalog item to show for this piece (colourway).
  chosen_photo_path: string | null;
  chosen_thumb_path: string | null;
  slot: string | null;
  sort_order: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
  created_at: string;
};

// A factory link stashed to review later (migration 0008, the "Later" tab).
export type SavedLink = {
  id: string;
  url: string;
  title: string | null;
  note: string | null;
  created_at: string;
};
