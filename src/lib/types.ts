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

// A factory link stashed to review later (migration 0008, the "Later" tab).
export type SavedLink = {
  id: string;
  url: string;
  title: string | null;
  note: string | null;
  created_at: string;
};
