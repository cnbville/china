"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  addField,
  createSet,
  deleteSet,
  GARMENT_TYPES,
  loadMeasurements,
  removeField,
  renameSet,
  templateFor,
  updateField,
} from "@/lib/measurements";
import type { Measurement, MeasurementKind, MeasurementSet } from "@/lib/types";

// The Measurements page (all cm). Three kinds of profile, each a named set of
// label/value rows:
//   body      — your own measurements
//   reference — your ideal garment specs per type, to match listings against
//   item      — measurements of a specific catalogued item
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

export function Measurements() {
  const [sets, setSets] = useState<MeasurementSet[]>([]);
  const [fields, setFields] = useState<Record<string, Measurement[]>>({});
  const [items, setItems] = useState<ItemLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  // --- mutations (local patch + DB) ---
  const supabase = createClient();

  async function onAddSet(
    kind: MeasurementKind,
    name: string,
    garmentType: string | null,
    itemId: string | null,
  ) {
    try {
      const labels = templateFor(kind === "body" ? "Body" : garmentType);
      await createSet(supabase, {
        kind,
        name: name.trim() || "Untitled",
        garment_type: garmentType,
        item_id: itemId,
        labels,
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
    const pos = (fields[setId]?.length ?? 0);
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

  const body = sets.filter((s) => s.kind === "body");
  const refs = sets.filter((s) => s.kind === "reference");
  const itemSets = sets.filter((s) => s.kind === "item");
  const titleById = new Map(items.map((i) => [i.id, i.title]));

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
        Keep your body profile, your ideal garment specs to match listings
        against, and the numbers for specific items.
      </p>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {!loading && (
        <div className="mt-8 space-y-10">
          {/* My body */}
          <Section
            title="My body"
            blurb="Your own measurements — the baseline you compare everything to."
          >
            {body.map((s) => (
              <SetCard
                key={s.id}
                set={s}
                fields={fields[s.id] ?? []}
                onRename={(n) => {
                  patchSetLocal(setSets, s.id, { name: n });
                  renameSet(supabase, s.id, n).catch(() => {});
                }}
                onAddField={() => onAddField(s.id)}
                onRemoveField={(id) => onRemoveField(s.id, id)}
                onFieldLabel={(id, label) => {
                  patchFieldLocal(s.id, id, { label });
                  updateField(supabase, id, { label }).catch(() => {});
                }}
                onFieldValue={(id, value_cm) => {
                  patchFieldLocal(s.id, id, { value_cm });
                  updateField(supabase, id, { value_cm }).catch(() => {});
                }}
                onDelete={() => onDeleteSet(s.id)}
              />
            ))}
            <AddButton
              label="＋ Add a body profile"
              onClick={() => onAddSet("body", "My measurements", null, null)}
            />
          </Section>

          {/* Fit references */}
          <Section
            title="Fit references"
            blurb="Your ideal garment specs per type — measure a piece that fits you perfectly, then match listings to it."
          >
            {refs.map((s) => (
              <SetCard
                key={s.id}
                set={s}
                fields={fields[s.id] ?? []}
                onRename={(n) => {
                  patchSetLocal(setSets, s.id, { name: n });
                  renameSet(supabase, s.id, n).catch(() => {});
                }}
                onAddField={() => onAddField(s.id)}
                onRemoveField={(id) => onRemoveField(s.id, id)}
                onFieldLabel={(id, label) => {
                  patchFieldLocal(s.id, id, { label });
                  updateField(supabase, id, { label }).catch(() => {});
                }}
                onFieldValue={(id, value_cm) => {
                  patchFieldLocal(s.id, id, { value_cm });
                  updateField(supabase, id, { value_cm }).catch(() => {});
                }}
                onDelete={() => onDeleteSet(s.id)}
              />
            ))}
            <NewReference onCreate={onAddSet} />
          </Section>

          {/* Item measurements */}
          <Section
            title="Item measurements"
            blurb="The actual numbers for a specific catalogued piece or size."
          >
            {itemSets.map((s) => (
              <SetCard
                key={s.id}
                set={s}
                fields={fields[s.id] ?? []}
                itemTitle={s.item_id ? titleById.get(s.item_id) : undefined}
                itemId={s.item_id}
                onRename={(n) => {
                  patchSetLocal(setSets, s.id, { name: n });
                  renameSet(supabase, s.id, n).catch(() => {});
                }}
                onAddField={() => onAddField(s.id)}
                onRemoveField={(id) => onRemoveField(s.id, id)}
                onFieldLabel={(id, label) => {
                  patchFieldLocal(s.id, id, { label });
                  updateField(supabase, id, { label }).catch(() => {});
                }}
                onFieldValue={(id, value_cm) => {
                  patchFieldLocal(s.id, id, { value_cm });
                  updateField(supabase, id, { value_cm }).catch(() => {});
                }}
                onDelete={() => onDeleteSet(s.id)}
              />
            ))}
            {items.length === 0 ? (
              <p className="text-meta text-muted">
                Add some items first, then log their measurements here.
              </p>
            ) : (
              <NewItemMeasurement items={items} onCreate={onAddSet} />
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

// Local patch helper for a set's own fields (name/notes).
function patchSetLocal(
  setSets: React.Dispatch<React.SetStateAction<MeasurementSet[]>>,
  id: string,
  patch: Partial<MeasurementSet>,
) {
  setSets((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-1 max-w-prose text-meta text-muted">{blurb}</p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </section>
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

function SetCard({
  set,
  fields,
  itemTitle,
  itemId,
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
  onRename: (name: string) => void;
  onAddField: () => void;
  onRemoveField: (id: string) => void;
  onFieldLabel: (id: string, label: string) => void;
  onFieldValue: (id: string, value: number | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-card border border-line bg-card/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            defaultValue={set.name}
            onBlur={(e) => onRename(e.target.value)}
            className="w-full bg-transparent font-serif text-lg text-ink outline-none"
          />
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {set.garment_type && <span>{set.garment_type}</span>}
            {itemTitle && itemId && (
              <>
                {set.garment_type && <span className="text-line">·</span>}
                <Link
                  href={`/items?id=${itemId}`}
                  className="truncate underline hover:text-ink"
                >
                  {itemTitle} ↗
                </Link>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          title="Delete profile"
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
        {fields.map((m) => (
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
                placeholder="—"
                className="w-14 bg-transparent text-right text-meta tnum text-ink outline-none placeholder:text-muted/60"
              />
              <span className="text-[11px] text-muted">cm</span>
            </div>
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
        ))}
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

function NewReference({
  onCreate,
}: {
  onCreate: (
    kind: MeasurementKind,
    name: string,
    garmentType: string | null,
    itemId: string | null,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(GARMENT_TYPES[0]);

  if (!open) {
    return <AddButton label="＋ New fit reference" onClick={() => setOpen(true)} />;
  }
  return (
    <div className="rounded-card border border-accent/50 bg-card p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
        New reference
      </div>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`e.g. "Ideal ${type.toLowerCase()}"`}
        className="input mt-2"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="input mt-2"
      >
        {GARMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onCreate("reference", name || `Ideal ${type.toLowerCase()}`, type, null);
            setOpen(false);
            setName("");
          }}
          className="btn-accent px-3 py-1.5 text-meta"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-meta text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewItemMeasurement({
  items,
  onCreate,
}: {
  items: ItemLite[];
  onCreate: (
    kind: MeasurementKind,
    name: string,
    garmentType: string | null,
    itemId: string | null,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? "");
  const [type, setType] = useState<string>(GARMENT_TYPES[0]);
  const [name, setName] = useState("");

  if (!open) {
    return <AddButton label="＋ Log an item's measurements" onClick={() => setOpen(true)} />;
  }
  return (
    <div className="rounded-card border border-accent/50 bg-card p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
        New item measurements
      </div>
      <select
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        className="input mt-2"
      >
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </select>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label — e.g. 'Size L'"
          className="input"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="input"
        >
          {GARMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const chosen = items.find((i) => i.id === itemId);
            onCreate(
              "item",
              name || chosen?.title || "Measurements",
              type,
              itemId || null,
            );
            setOpen(false);
            setName("");
          }}
          disabled={!itemId}
          className="btn-accent px-3 py-1.5 text-meta disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-meta text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
