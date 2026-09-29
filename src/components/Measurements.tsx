"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  addField,
  createSet,
  deleteSet,
  GARMENT_TYPES,
  groupOf,
  labelKey,
  loadMeasurements,
  removeField,
  renameSet,
  setGarmentType,
  templateFor,
  templateSlot,
  updateField,
  type GarmentType,
} from "@/lib/measurements";
import type { Measurement, MeasurementKind, MeasurementSet } from "@/lib/types";

// The Measurements page (all cm), organised the way you shop:
//   Me      — your own body measurements
//   Shirts / Hoodies & sweaters / Jackets / Pants / Shorts — each group holds
//             your fit reference ("the one that fits perfectly") and the
//             measurements of specific items, compared against it.
// New cards start from YOUR fields (see templateFor), not generic defaults —
// and "☆ Use as template" on any card makes it THE template for its group.
// Everything saves as you go (label/value on blur, add/remove immediately).

function parseCm(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function fmtCm(v: number | null): string {
  return v == null ? "" : String(v);
}

type ItemLite = { id: string; title: string };
type View = "All" | GarmentType;
const VIEW_KEY = "measurements-view";
// The card you starred as the template for each group ("Body", "Shirts", …).
const TEMPLATE_KEY = "measurement-templates";
const GROUPS: GarmentType[] = [...GARMENT_TYPES, "Other"];
const SINGULAR: Record<GarmentType, string> = {
  Shirts: "shirt",
  "Hoodies & sweaters": "hoodie",
  Jackets: "jacket",
  Pants: "pants",
  Shorts: "shorts",
  Other: "piece",
};

export function Measurements() {
  const [sets, setSets] = useState<MeasurementSet[]>([]);
  const [fields, setFields] = useState<Record<string, Measurement[]>>({});
  const [items, setItems] = useState<ItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<View>("All");
  const [chosen, setChosen] = useState<Record<string, string>>({});

  async function reload() {
    try {
      const supabase = createClient();
      const [{ sets, fields }, itemsRes] = await Promise.all([
        loadMeasurements(supabase),
        supabase.from("items").select("id, title").order("title"),
      ]);
      setSets(sets);
      setFields(fields);
      setItems((itemsRes.data ?? []) as ItemLite[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load measurements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    try {
      const t = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? "{}");
      if (t && typeof t === "object") setChosen(t);
    } catch {
      /* ignore */
    }
    try {
      const v = localStorage.getItem(VIEW_KEY) as View | null;
      if (v && (v === "All" || GROUPS.includes(v as GarmentType))) setViewState(v);
    } catch {
      /* ignore */
    }
  }, []);

  function setView(v: View) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  // --- mutations (local patch + DB) ---
  const supabase = createClient();

  async function onAddSet(
    kind: MeasurementKind,
    name: string,
    garmentType: string | null,
    itemId: string | null,
  ) {
    try {
      await createSet(supabase, {
        kind,
        name: name.trim() || "Untitled",
        garment_type: garmentType,
        item_id: itemId,
        labels: templateFor(kind, garmentType, sets, fields, chosen),
      });
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create.");
    }
  }

  async function onDeleteSet(id: string) {
    setSets((s) => s.filter((x) => x.id !== id));
    try {
      await deleteSet(supabase, id);
    } catch {
      reload();
    }
  }

  async function onAddField(setId: string) {
    const pos = fields[setId]?.length ?? 0;
    try {
      const row = await addField(supabase, setId, "", pos);
      setFields((f) => ({ ...f, [setId]: [...(f[setId] ?? []), row] }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't add field.");
    }
  }

  async function onRemoveField(setId: string, id: string) {
    setFields((f) => ({
      ...f,
      [setId]: (f[setId] ?? []).filter((m) => m.id !== id),
    }));
    try {
      await removeField(supabase, id);
    } catch {
      reload();
    }
  }

  function patchFieldLocal(setId: string, id: string, patch: Partial<Measurement>) {
    setFields((f) => ({
      ...f,
      [setId]: (f[setId] ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }
  function patchSetLocal(id: string, patch: Partial<MeasurementSet>) {
    setSets((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // Star a card: new cards in its group start with its fields. Tap again to unset.
  function toggleTemplate(s: MeasurementSet) {
    const slot = templateSlot(s);
    setChosen((c) => {
      const next = { ...c };
      if (next[slot] === s.id) delete next[slot];
      else next[slot] = s.id;
      try {
        localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Everything a card needs, wired once.
  function cardProps(s: MeasurementSet) {
    return {
      set: s,
      fields: fields[s.id] ?? [],
      isTemplate: chosen[templateSlot(s)] === s.id,
      onTemplate: () => toggleTemplate(s),
      onRename: (n: string) => {
        patchSetLocal(s.id, { name: n });
        renameSet(supabase, s.id, n).catch(() => {});
      },
      onAddField: () => onAddField(s.id),
      onRemoveField: (id: string) => onRemoveField(s.id, id),
      onFieldLabel: (id: string, label: string) => {
        patchFieldLocal(s.id, id, { label });
        updateField(supabase, id, { label }).catch(() => {});
      },
      onFieldValue: (id: string, value_cm: number | null) => {
        patchFieldLocal(s.id, id, { value_cm });
        updateField(supabase, id, { value_cm }).catch(() => {});
      },
      onDelete: () => onDeleteSet(s.id),
    };
  }
  function onMove(s: MeasurementSet, type: GarmentType) {
    patchSetLocal(s.id, { garment_type: type });
    setGarmentType(supabase, s.id, type).catch(() => reload());
  }

  const body = sets.filter((s) => s.kind === "body");
  const titleById = new Map(items.map((i) => [i.id, i.title]));
  const byGroup = useMemo(() => {
    const m = new Map<GarmentType, MeasurementSet[]>();
    for (const g of GROUPS) m.set(g, []);
    for (const s of sets) if (s.kind !== "body") m.get(groupOf(s.garment_type))!.push(s);
    return m;
  }, [sets]);
  const count = (g: GarmentType) => byGroup.get(g)?.length ?? 0;
  const navGroups = GROUPS.filter((g) => g !== "Other" || count("Other") > 0);
  const shown: GarmentType[] =
    view === "All" ? navGroups.filter((g) => count(g) > 0) : [view as GarmentType];
  const emptyGroups = navGroups.filter((g) => count(g) === 0 && g !== "Other");

  return (
    <div>
      <div className="mb-1 mt-2 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Sizing · all cm
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Measurements</h1>
      <p className="mt-2 max-w-prose text-meta text-muted">
        Flat measurements in centimetres — the way factory size charts are given.
        Shirts with shirts, jackets with jackets, pants with pants: each group
        holds your ideal fit and the pieces you&rsquo;ve measured against it.
      </p>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {!loading && (
        <div className="mt-8 space-y-10">
          {/* Me */}
          <section>
            <GroupHeading title="Me" sub="Your own body — the baseline for everything below." />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {body.map((s) => (
                <SetCard key={s.id} {...cardProps(s)} />
              ))}
              {body.length === 0 && (
                <AddButton
                  label="＋ Add your measurements"
                  onClick={() => onAddSet("body", "My measurements", null, null)}
                />
              )}
            </div>
            {body.length > 0 && (
              <button
                type="button"
                onClick={() => onAddSet("body", "Another profile", null, null)}
                className="mt-2 text-meta text-muted hover:text-ink"
              >
                ＋ Another body profile
              </button>
            )}
          </section>

          {/* Garment groups */}
          <div>
            <div className="sticky top-16 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-paper/80 px-1 py-2 backdrop-blur">
              <NavChip active={view === "All"} onClick={() => setView("All")}>
                All <span className="text-muted">· {sets.length - body.length}</span>
              </NavChip>
              {navGroups.map((g) => (
                <NavChip key={g} active={view === g} onClick={() => setView(g)}>
                  {g}
                  {count(g) > 0 && <span className="text-muted"> · {count(g)}</span>}
                </NavChip>
              ))}
            </div>

            <div className="mt-4 space-y-10">
              {shown.map((g) => (
                <GarmentSection
                  key={g}
                  group={g}
                  sets={byGroup.get(g) ?? []}
                  fields={fields}
                  items={items}
                  titleById={titleById}
                  cardProps={cardProps}
                  onMove={onMove}
                  onCreate={onAddSet}
                />
              ))}
              {view === "All" && shown.length === 0 && (
                <p className="text-meta text-muted">
                  No garment measurements yet — pick a group below to start.
                </p>
              )}
              {view === "All" && emptyGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-meta">
                  <span className="text-muted">Start a group:</span>
                  {emptyGroups.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setView(g)}
                      className="rounded-pill border border-dashed border-line px-3 py-1 text-muted transition-colors hover:border-accent hover:text-ink"
                    >
                      ＋ {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type CardProps = Omit<React.ComponentProps<typeof SetCard>, "itemTitle" | "itemId" | "compare" | "onMove">;

function GarmentSection({
  group,
  sets,
  fields,
  items,
  titleById,
  cardProps,
  onMove,
  onCreate,
}: {
  group: GarmentType;
  sets: MeasurementSet[];
  fields: Record<string, Measurement[]>;
  items: ItemLite[];
  titleById: Map<string, string>;
  cardProps: (s: MeasurementSet) => CardProps;
  onMove: (s: MeasurementSet, g: GarmentType) => void;
  onCreate: (kind: MeasurementKind, name: string, type: string | null, itemId: string | null) => void;
}) {
  const [adding, setAdding] = useState<"reference" | "item" | null>(null);
  const refs = sets.filter((s) => s.kind === "reference");
  const pieces = sets.filter((s) => s.kind === "item");
  const single = SINGULAR[group];

  // Your fit, by normalised label — what each item is compared against.
  const compare = useMemo(() => {
    const m = new Map<string, number>();
    const ref = refs[0];
    if (ref) for (const f of fields[ref.id] ?? []) if (f.value_cm != null) m.set(labelKey(f.label), f.value_cm);
    return m;
  }, [refs, fields]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <GroupHeading title={group} />
        <div className="flex items-center gap-3 text-meta">
          <button type="button" onClick={() => setAdding("reference")} className="text-muted hover:text-ink">
            ＋ Fit reference
          </button>
          {group !== "Other" && (
            <button
              type="button"
              onClick={() => setAdding("item")}
              disabled={items.length === 0}
              title={items.length === 0 ? "Add some items to your catalog first" : undefined}
              className="text-accentSoft hover:underline disabled:opacity-40"
            >
              ＋ Log an item
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="mt-4">
          <NewSetForm
            kind={adding}
            group={group}
            items={items}
            onCancel={() => setAdding(null)}
            onCreate={(name, itemId) => {
              onCreate(adding, name, group, itemId);
              setAdding(null);
            }}
          />
        </div>
      )}

      {sets.length === 0 && !adding && (
        <div className="mt-4 rounded-card border border-dashed border-line p-6 text-center text-meta text-muted">
          No {group.toLowerCase()} yet.{" "}
          <button type="button" onClick={() => setAdding("reference")} className="text-accentSoft hover:underline">
            Add your ideal {single} fit
          </button>{" "}
          — measure one that fits you perfectly, then compare listings to it.
        </div>
      )}

      {refs.length > 0 && (
        <>
          <SubLabel>Your fit</SubLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {refs.map((s) => (
              <SetCard key={s.id} {...cardProps(s)} onMove={(g) => onMove(s, g)} />
            ))}
          </div>
        </>
      )}

      {pieces.length > 0 && (
        <>
          <SubLabel>
            Items{compare.size > 0 && <span className="normal-case tracking-normal text-muted/80"> — compared with your fit</span>}
          </SubLabel>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pieces.map((s) => (
              <SetCard
                key={s.id}
                {...cardProps(s)}
                itemTitle={s.item_id ? titleById.get(s.item_id) : undefined}
                itemId={s.item_id}
                compare={compare}
                onMove={(g) => onMove(s, g)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function GroupHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="font-serif text-2xl">{title}</h2>
      {sub && <p className="mt-1 max-w-prose text-meta text-muted">{sub}</p>}
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 text-[11px] uppercase tracking-[0.18em] text-muted">{children}</div>
  );
}

function NavChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 whitespace-nowrap rounded-pill border px-3 py-1 text-meta transition-colors " +
        (active
          ? "border-accent/60 bg-accent/10 text-ink"
          : "border-line bg-card/50 text-muted hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] items-center justify-center rounded-card border border-dashed border-line text-meta text-muted transition-colors hover:border-accent hover:text-ink"
    >
      {label}
    </button>
  );
}

// How far an item is from your fit: ≤1 cm reads as a match, ≤3 as close.
function Diff({ d }: { d: number }) {
  const a = Math.abs(d);
  const txt = a < 0.05 ? "=" : `${d > 0 ? "+" : "−"}${Number(a.toFixed(1))}`;
  const cls = a <= 1 ? "text-emerald-400/90" : a <= 3 ? "text-muted" : "text-amber-300/90";
  return (
    <span className={`w-10 shrink-0 text-right text-[11px] tnum ${cls}`} title="Compared with your fit">
      {txt}
    </span>
  );
}

function SetCard({
  set,
  fields,
  itemTitle,
  itemId,
  compare,
  isTemplate,
  onTemplate,
  onMove,
  onRename,
  onAddField,
  onRemoveField,
  onFieldLabel,
  onFieldValue,
  onDelete,
}: {
  set: MeasurementSet;
  fields: Measurement[];
  itemTitle?: string;
  itemId?: string | null;
  compare?: Map<string, number>;
  isTemplate: boolean;
  onTemplate: () => void;
  onMove?: (g: GarmentType) => void;
  onRename: (name: string) => void;
  onAddField: () => void;
  onRemoveField: (id: string) => void;
  onFieldLabel: (id: string, label: string) => void;
  onFieldValue: (id: string, value: number | null) => void;
  onDelete: () => void;
}) {
  const hasCompare = !!compare && compare.size > 0;
  return (
    <div className="rounded-card border border-line bg-card/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            defaultValue={set.name}
            onBlur={(e) => onRename(e.target.value)}
            className="w-full bg-transparent font-serif text-lg text-ink outline-none"
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            {onMove && (
              <select
                value={groupOf(set.garment_type)}
                onChange={(e) => onMove(e.target.value as GarmentType)}
                title="Move to another group"
                className="-ml-1 rounded-[5px] bg-transparent px-1 py-0.5 text-[11px] text-muted outline-none hover:bg-surface2 hover:text-ink"
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
            {itemTitle && itemId && (
              <>
                {onMove && <span className="text-line">·</span>}
                <Link href={`/items?id=${itemId}`} className="truncate underline hover:text-ink">
                  {itemTitle} ↗
                </Link>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onTemplate}
          title={
            isTemplate
              ? "This is your template — tap to stop using it"
              : `Make this the template: new ${set.kind === "body" ? "body profiles" : groupOf(set.garment_type).toLowerCase()} start with these fields`
          }
          className={
            "mt-0.5 shrink-0 whitespace-nowrap rounded-pill border px-2.5 py-1 text-[11px] transition-colors " +
            (isTemplate
              ? "border-accent/60 bg-accent/15 text-accentSoft"
              : "border-line text-muted hover:border-accent/50 hover:text-ink")
          }
        >
          {isTemplate ? "★ Template" : "☆ Use as template"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete"
          className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:text-accentSoft"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
          </svg>
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        {fields.map((m) => {
          const ref = compare?.get(labelKey(m.label));
          return (
            <div key={m.id} className="flex items-center gap-2">
              <input
                defaultValue={m.label}
                onBlur={(e) => onFieldLabel(m.id, e.target.value)}
                placeholder="Measurement"
                className="min-w-0 flex-1 rounded-card border border-line bg-surface2/40 px-2.5 py-1.5 text-meta text-ink outline-none focus:border-accent/60"
              />
              <div className="flex items-center gap-1 rounded-card border border-line bg-surface2/40 px-2.5 py-1.5 focus-within:border-accent/60">
                <input
                  defaultValue={fmtCm(m.value_cm)}
                  onBlur={(e) => onFieldValue(m.id, parseCm(e.target.value))}
                  inputMode="decimal"
                  placeholder={ref != null ? String(ref) : "—"}
                  title={ref != null ? `Your fit: ${ref} cm` : undefined}
                  className="w-14 bg-transparent text-right text-meta tnum text-ink outline-none placeholder:text-muted/40"
                />
                <span className="text-[11px] text-muted">cm</span>
              </div>
              {hasCompare &&
                (ref != null && m.value_cm != null ? (
                  <Diff d={m.value_cm - ref} />
                ) : (
                  <span className="w-10 shrink-0" />
                ))}
              <button
                type="button"
                onClick={() => onRemoveField(m.id)}
                title="Remove"
                className="shrink-0 rounded-full p-1 text-muted transition-colors hover:text-accentSoft"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAddField}
        className="mt-2 text-meta text-muted transition-colors hover:text-accent"
      >
        ＋ Add measurement
      </button>
    </div>
  );
}

function NewSetForm({
  kind,
  group,
  items,
  onCreate,
  onCancel,
}: {
  kind: "reference" | "item";
  group: GarmentType;
  items: ItemLite[];
  onCreate: (name: string, itemId: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? "");
  const single = SINGULAR[group];

  return (
    <div className="rounded-card border border-accent/50 bg-card p-4 md:max-w-[calc(50%-0.375rem)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
        {kind === "reference" ? `New ${single} fit reference` : `Log a ${single}'s measurements`}
      </div>
      {kind === "item" && (
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="input mt-2">
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={kind === "reference" ? `e.g. "My perfect ${single}"` : "Label — e.g. 'Size L'"}
        className="input mt-2"
      />
      <p className="mt-2 text-[11px] text-muted">Starts with the fields of your ★ template (or your own {single} measurements).</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={kind === "item" && !itemId}
          className="btn-accent px-3 py-1.5 text-meta disabled:opacity-50"
        >
          Create
        </button>
        <button type="button" onClick={onCancel} className="text-meta text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );

  function submit() {
    if (kind === "reference") {
      onCreate(name || `My ${single} fit`, null);
    } else {
      const chosen = items.find((i) => i.id === itemId);
      onCreate(name || chosen?.title || "Measurements", itemId || null);
    }
  }
}
