"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCatalog } from "@/lib/catalogStore";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrls";
import {
  createOutfit,
  deleteOutfit,
  listAllPieces,
  listOutfits,
} from "@/lib/outfits";
import { PriceHint } from "@/components/PriceHint";
import type { ItemCard, Outfit, OutfitPiece } from "@/lib/types";

type Data = { outfits: Outfit[]; piecesByOutfit: Record<string, OutfitPiece[]> };

export function OutfitsList() {
  const router = useRouter();
  const { data: catalog } = useCatalog();
  const itemsById = useMemo(() => {
    const m: Record<string, ItemCard> = {};
    for (const i of catalog?.items ?? []) m[i.id] = i;
    return m;
  }, [catalog]);

  const { data, loading, error, refetch } = useLiveData<Data>(async () => {
    const supabase = createClient();
    const [outfits, pieces] = await Promise.all([
      listOutfits(supabase),
      listAllPieces(supabase),
    ]);
    const piecesByOutfit: Record<string, OutfitPiece[]> = {};
    for (const p of pieces) (piecesByOutfit[p.outfit_id] ??= []).push(p);
    return { outfits, piecesByOutfit };
  });

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // The cover thumbnail path for an outfit = its first piece's image.
  function coverPath(pieces: OutfitPiece[]): string | null {
    const first = pieces[0];
    if (!first) return null;
    if (first.item_id) return itemsById[first.item_id]?.thumb_path ?? null;
    return first.thumb_path;
  }

  function total(pieces: OutfitPiece[]): number {
    let sum = 0;
    for (const p of pieces) {
      if (p.item_id) {
        const price = itemsById[p.item_id]?.lead_price;
        if (price != null) sum += price;
      }
    }
    return sum;
  }

  useEffect(() => {
    if (!data) return;
    const paths = data.outfits
      .map((o) => coverPath(data.piecesByOutfit[o.id] ?? []))
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    getSignedUrls(createClient(), paths).then(setThumbs).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, itemsById]);

  async function newOutfit() {
    setBusy(true);
    try {
      const o = await createOutfit(createClient());
      router.push(`/outfits?id=${o.id}`);
    } catch (e) {
      alert(`Couldn't create outfit: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  async function remove(o: Outfit, pieces: OutfitPiece[]) {
    if (!confirm(`Delete the outfit "${o.name}"? This can't be undone.`)) return;
    try {
      await deleteOutfit(createClient(), o.id, pieces);
      refetch();
    } catch (e) {
      alert(`Couldn't delete: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
            <span className="text-meta uppercase tracking-[0.2em] text-muted">
              Looks
            </span>
          </div>
          <h1 className="font-serif text-4xl leading-tight">Outfits</h1>
          <p className="mt-2 text-meta text-muted">
            Build complete looks from your catalog — arrange them on a canvas, in
            slots, or as a simple stack.
          </p>
        </div>
        <button
          onClick={newOutfit}
          disabled={busy}
          className="btn-accent shrink-0 disabled:opacity-50"
        >
          {busy ? "…" : "New outfit"}
        </button>
      </div>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && data.outfits.length === 0 && (
        <p className="mt-8 text-meta text-muted">
          No outfits yet. Hit <span className="text-ink">New outfit</span> to
          build your first look.
        </p>
      )}

      {data && data.outfits.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.outfits.map((o) => {
            const pieces = data.piecesByOutfit[o.id] ?? [];
            const cover = coverPath(pieces);
            const sum = total(pieces);
            return (
              <div
                key={o.id}
                className="group relative overflow-hidden rounded-card border border-line bg-card transition-all hover:border-accent/50 hover:shadow-lift"
              >
                <button
                  onClick={() => remove(o, pieces)}
                  title="Delete outfit"
                  className="absolute right-2 top-2 z-10 rounded-full border border-white/10 bg-black/50 p-1.5 text-white/70 backdrop-blur transition-colors hover:bg-accent hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
                  </svg>
                </button>
                <Link href={`/outfits?id=${o.id}`} className="block">
                  <div className="photo-frame">
                    {cover && thumbs[cover] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbs[cover]} alt={o.name} />
                    ) : (
                      <div className="flex h-full items-center justify-center text-meta text-muted">
                        {pieces.length > 0 ? `${pieces.length} pieces` : "empty"}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-body">{o.name}</div>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-meta text-muted tnum">
                      {o.season && (
                        <span className="rounded-pill border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                          {o.season}
                        </span>
                      )}
                      {sum > 0 ? (
                        <span className="text-accentSoft">¥{fmt(sum)}</span>
                      ) : (
                        <span>{pieces.length} pieces</span>
                      )}
                      {sum > 0 && (
                        <PriceHint cny={sum} className="w-full text-[11px]" />
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
