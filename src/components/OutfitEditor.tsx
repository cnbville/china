"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { PriceHint } from "@/components/PriceHint";
import { useCatalog } from "@/lib/catalogStore";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrls } from "@/lib/signedUrls";
import {
  OUTFIT_SLOTS,
  addCatalogPiece,
  addPlaceholderPiece,
  deleteOutfit,
  getOutfit,
  removePiece,
  updateOutfit,
  updatePiece,
} from "@/lib/outfits";
import type { ItemCard, Outfit, OutfitPiece } from "@/lib/types";

type Mode = "canvas" | "slots" | "stack";
const MODES: { key: Mode; label: string }[] = [
  { key: "canvas", label: "Canvas" },
  { key: "slots", label: "Slots" },
  { key: "stack", label: "Stack" },
];

type Resolved = {
  title: string;
  price: number | null;
  thumbPath: string | null;
  isPlaceholder: boolean;
};

type PiecePatch = Partial<
  Pick<OutfitPiece, "slot" | "sort_order" | "x" | "y" | "scale" | "rotation" | "z">
>;

export function OutfitEditor({ outfitId }: { outfitId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { data: catalog } = useCatalog();
  const itemsById = useMemo(() => {
    const m: Record<string, ItemCard> = {};
    for (const i of catalog?.items ?? []) m[i.id] = i;
    return m;
  }, [catalog]);

  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [pieces, setPieces] = useState<OutfitPiece[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [mode, setMode] = useState<Mode>("canvas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Remember the last-used view per device.
  useEffect(() => {
    try {
      const m = localStorage.getItem("outfit-view-mode") as Mode | null;
      if (m && MODES.some((x) => x.key === m)) setMode(m);
    } catch {
      /* ignore */
    }
  }, []);
  function pickMode(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem("outfit-view-mode", m);
    } catch {
      /* ignore */
    }
  }

  // Load once; edits persist as we go (don't refetch under the user).
  useEffect(() => {
    let alive = true;
    getOutfit(supabase, outfitId)
      .then(({ outfit, pieces }) => {
        if (!alive) return;
        setOutfit(outfit);
        setPieces(pieces);
        setName(outfit.name);
        setSeason(outfit.season ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed."));
    return () => {
      alive = false;
    };
  }, [outfitId, supabase]);

  // Bin an untouched brand-new outfit when you leave, so the list stays clean.
  const stateRef = useRef({ pieces, name, season });
  stateRef.current = { pieces, name, season };
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (
        s.pieces &&
        s.pieces.length === 0 &&
        s.name.trim() === "Untitled outfit" &&
        !s.season.trim()
      ) {
        deleteOutfit(supabase, outfitId, []).catch(() => {});
      }
    };
  }, [outfitId, supabase]);

  function resolve(p: OutfitPiece): Resolved {
    if (p.item_id) {
      const it = itemsById[p.item_id];
      return {
        title: it?.title ?? "(deleted item)",
        price: it?.lead_price ?? null,
        thumbPath: it?.thumb_path ?? null,
        isPlaceholder: false,
      };
    }
    return {
      title: p.placeholder_label ?? "Placeholder",
      price: null,
      thumbPath: p.thumb_path,
      isPlaceholder: true,
    };
  }

  // Sign every visible thumbnail.
  useEffect(() => {
    if (!pieces) return;
    const paths = pieces
      .map((p) => resolve(p).thumbPath)
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    getSignedUrls(supabase, paths).then(setThumbs).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, itemsById, supabase]);

  const ordered = useMemo(
    () => (pieces ? [...pieces].sort((a, b) => a.sort_order - b.sort_order) : []),
    [pieces],
  );
  const total = useMemo(
    () => ordered.reduce((s, p) => s + (resolve(p).price ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordered, itemsById],
  );

  // ---- persistence-backed mutations ----
  function saveOutfitField(patch: { name?: string; season?: string }) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateOutfit(supabase, outfitId, {
        name: patch.name?.trim() || undefined,
        season: patch.season !== undefined ? patch.season.trim() || null : undefined,
      }).catch(() => {});
    }, 500);
  }

  async function addFromCatalog(item: ItemCard) {
    const order = pieces?.length ?? 0;
    const row = await addCatalogPiece(supabase, outfitId, item, order);
    setPieces((ps) => [...(ps ?? []), row]);
  }
  async function addPlaceholder(label: string, photo: Blob | null) {
    const order = pieces?.length ?? 0;
    const row = await addPlaceholderPiece(supabase, outfitId, label, order, photo);
    setPieces((ps) => [...(ps ?? []), row]);
  }
  async function remove(p: OutfitPiece) {
    setPieces((ps) => (ps ?? []).filter((x) => x.id !== p.id));
    if (selectedId === p.id) setSelectedId(null);
    await removePiece(supabase, p).catch(() => {});
  }
  function patchLocal(id: string, patch: PiecePatch) {
    setPieces((ps) => (ps ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function persist(id: string, patch: PiecePatch) {
    patchLocal(id, patch);
    updatePiece(supabase, id, patch).catch(() => {});
  }
  function move(id: string, dir: -1 | 1) {
    const list = ordered;
    const idx = list.findIndex((p) => p.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= list.length) return;
    const a = list[idx];
    const b = list[swapWith];
    persist(a.id, { sort_order: b.sort_order });
    persist(b.id, { sort_order: a.sort_order });
  }

  async function deleteThisOutfit() {
    if (!confirm("Delete this whole outfit? This can't be undone.")) return;
    await deleteOutfit(supabase, outfitId, pieces ?? []).catch(() => {});
    router.replace("/outfits");
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-[1100px] px-4 py-8">
          <p className="text-meta text-accentSoft">{error}</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 py-6">
        {/* Header row */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
              <span className="text-meta uppercase tracking-[0.2em] text-muted">
                Outfit
              </span>
            </div>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                saveOutfitField({ name: e.target.value });
              }}
              className="w-full max-w-lg border-none bg-transparent font-serif text-4xl leading-tight outline-none focus:underline"
              placeholder="Untitled outfit"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-meta text-muted">
                Season
                <input
                  value={season}
                  onChange={(e) => {
                    setSeason(e.target.value);
                    saveOutfitField({ season: e.target.value });
                  }}
                  placeholder="e.g. Winter"
                  className="w-32 rounded-pill border border-line bg-card px-3 py-1 text-meta text-ink"
                />
              </label>
              <span className="text-meta text-muted">
                {ordered.length} {ordered.length === 1 ? "piece" : "pieces"}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="font-serif text-3xl text-accentSoft tnum">
              {total > 0 ? `¥${fmt(total)}` : "—"}
            </div>
            {total > 0 && <PriceHint cny={total} className="text-[11px]" />}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setPickerOpen(true)}
                className="btn-accent px-3 py-2 text-meta"
              >
                + Add pieces
              </button>
              <button
                onClick={deleteThisOutfit}
                title="Delete outfit"
                className="rounded-card border border-line px-3 py-2 text-meta text-muted transition-colors hover:border-accent hover:text-accentSoft"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Mode switch */}
        <div className="mt-6 flex items-center gap-1 rounded-pill border border-line bg-card/60 p-1 text-meta w-fit">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => pickMode(m.key)}
              className={
                "rounded-pill px-4 py-1.5 transition-colors " +
                (mode === m.key
                  ? "bg-accent text-white"
                  : "text-muted hover:text-ink")
              }
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {pieces && ordered.length === 0 && (
          <div className="mt-6 rounded-card border border-dashed border-line p-10 text-center">
            <p className="text-body text-muted">No pieces yet.</p>
            <button
              onClick={() => setPickerOpen(true)}
              className="btn-ghost mt-3"
            >
              + Add your first piece
            </button>
          </div>
        )}

        {/* Views */}
        {pieces && ordered.length > 0 && (
          <div className="mt-6">
            {mode === "canvas" && (
              <CanvasView
                pieces={ordered}
                thumbs={thumbs}
                resolve={resolve}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                onMove={(id, x, y) => patchLocal(id, { x, y })}
                onCommit={(id, x, y) => persist(id, { x, y })}
                onAction={(id, patch) => persist(id, patch)}
                onRemove={remove}
              />
            )}
            {mode === "slots" && (
              <SlotsView
                pieces={ordered}
                thumbs={thumbs}
                resolve={resolve}
                onSlot={(id, slot) => persist(id, { slot })}
                onRemove={remove}
              />
            )}
            {mode === "stack" && (
              <StackView
                pieces={ordered}
                thumbs={thumbs}
                resolve={resolve}
                onMove={move}
                onRemove={remove}
              />
            )}
          </div>
        )}
      </main>

      {pickerOpen && (
        <PiecePicker
          items={catalog?.items ?? []}
          alreadyIn={new Set(ordered.map((p) => p.item_id).filter(Boolean) as string[])}
          onAddItem={addFromCatalog}
          onAddPlaceholder={addPlaceholder}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

// ---------- Canvas ----------
function CanvasView({
  pieces,
  thumbs,
  resolve,
  selectedId,
  setSelectedId,
  onMove,
  onCommit,
  onAction,
  onRemove,
}: {
  pieces: OutfitPiece[];
  thumbs: Record<string, string>;
  resolve: (p: OutfitPiece) => Resolved;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onCommit: (id: string, x: number, y: number) => void;
  onAction: (id: string, patch: PiecePatch) => void;
  onRemove: (p: OutfitPiece) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const selected = pieces.find((p) => p.id === selectedId) ?? null;
  const maxZ = pieces.reduce((m, p) => Math.max(m, p.z), 0);

  function startDrag(e: React.PointerEvent, piece: OutfitPiece) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(piece.id);
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    let lx = piece.x;
    let ly = piece.y;
    const clamp = (n: number) => Math.max(6, Math.min(94, n));
    const onPointerMove = (ev: PointerEvent) => {
      lx = clamp(((ev.clientX - rect.left) / rect.width) * 100);
      ly = clamp(((ev.clientY - rect.top) / rect.height) * 100);
      onMove(piece.id, lx, ly);
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      onCommit(piece.id, lx, ly);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return (
    <div>
      {/* toolbar acts on the selected piece */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-meta">
        <span className="text-muted">
          {selected ? "Selected piece:" : "Tap a piece to select · drag to move"}
        </span>
        <div className="flex items-center gap-1">
          <ToolBtn disabled={!selected} onClick={() => selected && onAction(selected.id, { z: maxZ + 1 })} label="Front">⤒</ToolBtn>
          <ToolBtn disabled={!selected} onClick={() => selected && onAction(selected.id, { rotation: selected.rotation - 15 })} label="Rotate left">⟲</ToolBtn>
          <ToolBtn disabled={!selected} onClick={() => selected && onAction(selected.id, { rotation: selected.rotation + 15 })} label="Rotate right">⟳</ToolBtn>
          <ToolBtn disabled={!selected} onClick={() => selected && onAction(selected.id, { scale: Math.max(0.4, selected.scale / 1.15) })} label="Smaller">－</ToolBtn>
          <ToolBtn disabled={!selected} onClick={() => selected && onAction(selected.id, { scale: Math.min(2.4, selected.scale * 1.15) })} label="Bigger">＋</ToolBtn>
          <ToolBtn disabled={!selected} danger onClick={() => selected && onRemove(selected)} label="Remove">🗑</ToolBtn>
        </div>
      </div>

      <div
        ref={boardRef}
        onPointerDown={() => setSelectedId(null)}
        className="relative mx-auto aspect-[4/5] max-h-[72vh] w-full overflow-hidden rounded-card border border-line"
        style={{
          background:
            "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px) 0 0/24px 24px, linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px) 0 0/24px 24px, #0b0d12",
          touchAction: "none",
        }}
      >
        {pieces.map((p) => {
          const r = resolve(p);
          const src = r.thumbPath ? thumbs[r.thumbPath] : undefined;
          return (
            <div
              key={p.id}
              onPointerDown={(e) => startDrag(e, p)}
              className={
                "absolute cursor-grab overflow-hidden rounded-[10px] border bg-card shadow-lift active:cursor-grabbing " +
                (selectedId === p.id ? "border-accent" : "border-line")
              }
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${18 * p.scale}%`,
                transform: `translate(-50%,-50%) rotate(${p.rotation}deg)`,
                zIndex: p.z,
                boxShadow:
                  selectedId === p.id ? "0 0 0 1px var(--accent), 0 12px 40px -12px rgba(0,0,0,.7)" : undefined,
              }}
            >
              <div className="aspect-[4/5] bg-[#05060a]">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={r.title} className="pointer-events-none h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="flex h-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted">
                    {r.title}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "h-8 w-8 rounded-card border border-line bg-card text-ink transition-colors disabled:opacity-40 " +
        (danger ? "hover:border-accent hover:text-accentSoft" : "hover:border-accent/60")
      }
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden>{children}</span>
    </button>
  );
}

// ---------- Slots ----------
function SlotsView({
  pieces,
  thumbs,
  resolve,
  onSlot,
  onRemove,
}: {
  pieces: OutfitPiece[];
  thumbs: Record<string, string>;
  resolve: (p: OutfitPiece) => Resolved;
  onSlot: (id: string, slot: string | null) => void;
  onRemove: (p: OutfitPiece) => void;
}) {
  const unassigned = pieces.filter((p) => !p.slot);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {OUTFIT_SLOTS.map((slot) => {
          const inSlot = pieces.filter((p) => p.slot === slot);
          return (
            <div key={slot} className="rounded-card border border-line bg-card/40 p-3">
              <div className="mb-2 text-[10.5px] uppercase tracking-[0.18em] text-muted">
                {slot}
              </div>
              {inSlot.length === 0 ? (
                <p className="py-3 text-center text-meta text-muted/70">Empty</p>
              ) : (
                <div className="space-y-2">
                  {inSlot.map((p) => (
                    <PieceRow key={p.id} p={p} r={resolve(p)} thumbs={thumbs} onSlot={onSlot} onRemove={onRemove} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-card border border-dashed border-line p-3">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.18em] text-muted">
            Unassigned — pick a slot
          </div>
          <div className="space-y-2">
            {unassigned.map((p) => (
              <PieceRow key={p.id} p={p} r={resolve(p)} thumbs={thumbs} onSlot={onSlot} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PieceRow({
  p,
  r,
  thumbs,
  onSlot,
  onRemove,
}: {
  p: OutfitPiece;
  r: Resolved;
  thumbs: Record<string, string>;
  onSlot: (id: string, slot: string | null) => void;
  onRemove: (p: OutfitPiece) => void;
}) {
  const src = r.thumbPath ? thumbs[r.thumbPath] : undefined;
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-line bg-card p-2">
      <div className="h-14 w-[2.8rem] shrink-0 overflow-hidden rounded-[6px] bg-[#05060a]">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body">{r.title}</div>
        <div className="text-meta text-muted tnum">
          {r.price != null ? `¥${fmt(r.price)}` : r.isPlaceholder ? "placeholder" : "no price"}
        </div>
      </div>
      <select
        value={p.slot ?? ""}
        onChange={(e) => onSlot(p.id, e.target.value || null)}
        className="rounded-card border border-line bg-card px-2 py-1 text-meta text-muted"
      >
        <option value="">Unassigned</option>
        {OUTFIT_SLOTS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        onClick={() => onRemove(p)}
        title="Remove"
        className="rounded-full border border-line p-1.5 text-muted transition-colors hover:border-accent hover:text-accentSoft"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

// ---------- Stack ----------
function StackView({
  pieces,
  thumbs,
  resolve,
  onMove,
  onRemove,
}: {
  pieces: OutfitPiece[];
  thumbs: Record<string, string>;
  resolve: (p: OutfitPiece) => Resolved;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (p: OutfitPiece) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {pieces.map((p, i) => {
        const r = resolve(p);
        const src = r.thumbPath ? thumbs[r.thumbPath] : undefined;
        return (
          <div key={p.id} className="overflow-hidden rounded-card border border-line bg-card">
            <div className="photo-frame">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={r.title} />
              ) : (
                <div className="flex h-full items-center justify-center px-2 text-center text-meta text-muted">
                  {r.title}
                </div>
              )}
              {i === 0 && (
                <span className="absolute left-2 top-2 rounded-pill bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              )}
            </div>
            <div className="p-2.5">
              <div className="truncate text-body">{r.title}</div>
              <div className="text-meta text-muted tnum">
                {r.price != null ? `¥${fmt(r.price)}` : r.isPlaceholder ? "placeholder" : "no price"}
              </div>
              <div className="mt-2 flex items-center gap-1">
                <button onClick={() => onMove(p.id, -1)} disabled={i === 0} title="Move earlier" className="rounded-card border border-line px-2 py-0.5 text-meta text-muted disabled:opacity-30 hover:text-ink">←</button>
                <button onClick={() => onMove(p.id, 1)} disabled={i === pieces.length - 1} title="Move later" className="rounded-card border border-line px-2 py-0.5 text-meta text-muted disabled:opacity-30 hover:text-ink">→</button>
                <button onClick={() => onRemove(p)} title="Remove" className="ml-auto rounded-full border border-line p-1 text-muted transition-colors hover:border-accent hover:text-accentSoft">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Piece picker ----------
function PiecePicker({
  items,
  alreadyIn,
  onAddItem,
  onAddPlaceholder,
  onClose,
}: {
  items: ItemCard[];
  alreadyIn: Set<string>;
  onAddItem: (item: ItemCard) => Promise<void>;
  onAddPlaceholder: (label: string, photo: Blob | null) => Promise<void>;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? items.filter((i) =>
          [i.title, i.type, i.brand].some((v) => v?.toLowerCase().includes(t)),
        )
      : items;
    return list.slice(0, 60);
  }, [items, q]);

  useEffect(() => {
    const paths = filtered
      .map((i) => i.thumb_path)
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    getSignedUrls(supabase, paths).then(setThumbs).catch(() => {});
  }, [filtered, supabase]);

  async function addItem(item: ItemCard) {
    setBusy(true);
    try {
      await onAddItem(item);
      setAdded((s) => new Set(s).add(item.id));
    } finally {
      setBusy(false);
    }
  }
  async function addPlaceholder() {
    const l = label.trim();
    if (!l) return;
    setBusy(true);
    try {
      await onAddPlaceholder(l, file);
      setLabel("");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-card border border-line bg-paper shadow-lift sm:rounded-card"
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="font-serif text-2xl">Add pieces</h2>
          <button onClick={onClose} className="rounded-card p-2 text-muted hover:bg-surface2 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {/* Quick placeholder */}
          <div className="rounded-card border border-line bg-card/50 p-3">
            <div className="mb-2 text-[10.5px] uppercase tracking-[0.18em] text-muted">
              Quick placeholder — something you own
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlaceholder()}
                placeholder="e.g. black Air Force 1s"
                className="input flex-1"
              />
              <label className="cursor-pointer rounded-card border border-line px-3 py-2 text-meta text-muted hover:text-ink">
                {file ? "Photo ✓" : "Photo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <button onClick={addPlaceholder} disabled={busy || !label.trim()} className="btn-accent px-3 py-2 text-meta disabled:opacity-50">Add</button>
            </div>
          </div>

          {/* Catalog */}
          <div className="mt-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your catalog…"
              className="input"
            />
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filtered.map((it) => {
                const inOutfit = alreadyIn.has(it.id) || added.has(it.id);
                const src = it.thumb_path ? thumbs[it.thumb_path] : undefined;
                return (
                  <button
                    key={it.id}
                    onClick={() => addItem(it)}
                    disabled={busy}
                    className="group relative overflow-hidden rounded-[10px] border border-line bg-card text-left transition-colors hover:border-accent/60 disabled:opacity-60"
                  >
                    <div className="aspect-[4/5] bg-[#05060a]">
                      {src && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={it.title} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="p-1.5">
                      <div className="truncate text-[11px]">{it.title}</div>
                    </div>
                    <span className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white backdrop-blur">
                      {inOutfit ? (
                        <svg viewBox="0 0 24 24" className="h-3 w-3 text-accentSoft" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <p className="mt-4 text-meta text-muted">No catalog items match.</p>
            )}
          </div>
        </div>

        <div className="border-t border-line p-3 text-center">
          <button onClick={onClose} className="btn-ghost">Done</button>
        </div>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
