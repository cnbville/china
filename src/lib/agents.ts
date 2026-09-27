import type { SupabaseClient } from "@supabase/supabase-js";

// Shipping agents (/agents), persisted in the `shipping_agents` table. The page
// edits plain strings (so half-typed numbers like "7," survive); this module
// converts to/from the numeric columns and syncs only what changed.

export type Agent = {
  id: string;
  name: string;
  usd: string; // $ the agent charges for ¥1000
  eur: string; // € the agent charges for ¥1000
  proc?: string; // processing fee, % (added on top of the rate)
  ship?: string; // domestic shipping in China, ¥ (reference, not in ranking)
  fee: string; // cheapest payment fee, % (reference only)
};

type Row = {
  id: string;
  name: string;
  usd: number | null;
  eur: number | null;
  processing: number | null;
  domestic_cny: number | null;
  payment_fee: number | null;
  is_baseline: boolean;
};

const TABLE = "shipping_agents";

export function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const str = (n: number | null) => (n === null ? "" : String(n));

export function toRow(a: Agent, baseId: string | null): Row {
  return {
    id: a.id,
    name: a.name,
    usd: num(a.usd),
    eur: num(a.eur),
    processing: num(a.proc),
    domestic_cny: num(a.ship),
    payment_fee: num(a.fee),
    is_baseline: a.id === baseId,
  };
}

export async function fetchAgents(
  supabase: SupabaseClient,
): Promise<{ agents: Agent[]; baseId: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  return {
    agents: rows.map((r) => ({
      id: r.id,
      name: r.name,
      usd: str(r.usd),
      eur: str(r.eur),
      proc: str(r.processing),
      ship: str(r.domestic_cny),
      fee: str(r.payment_fee),
    })),
    baseId: rows.find((r) => r.is_baseline)?.id ?? null,
  };
}

/**
 * Push the difference between `synced` (id → last saved row JSON) and the
 * current rows: upsert changed/new rows, delete removed ones. Returns the new
 * synced map on success.
 */
export async function syncAgents(
  supabase: SupabaseClient,
  rows: Row[],
  synced: Map<string, string>,
): Promise<Map<string, string>> {
  const next = new Map(rows.map((r) => [r.id, JSON.stringify(r)]));
  const changed = rows.filter((r) => synced.get(r.id) !== next.get(r.id));
  const removed = [...synced.keys()].filter((id) => !next.has(id));
  if (changed.length) {
    const { error } = await supabase.from(TABLE).upsert(changed);
    if (error) throw error;
  }
  if (removed.length) {
    const { error } = await supabase.from(TABLE).delete().in("id", removed);
    if (error) throw error;
  }
  return next;
}
