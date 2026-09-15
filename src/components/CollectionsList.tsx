"use client";

import { useState } from "react";
import Link from "next/link";
import { CatalogNav } from "@/components/CatalogNav";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { deleteCollection, renameCollection } from "@/lib/catalog";
import type { Collection } from "@/lib/types";

// Dedicated Collections page: your chosen sets ("Winter", "School"). Opening one
// shows just that collection's items.
type WithCount = Collection & { count: number };
type Data = { collections: WithCount[] };

export function CollectionsList() {
  const { data, loading, error, refetch } = useLiveData<Data>(async () => {
    const supabase = createClient();
    const [collRes, itemsRes] = await Promise.all([
      supabase.from("collections").select("*").order("name"),
      supabase.from("items").select("collection_id"),
    ]);
    if (collRes.error) throw collRes.error;
    if (itemsRes.error) throw itemsRes.error;

    const counts: Record<string, number> = {};
    for (const row of itemsRes.data ?? [])
      if (row.collection_id)
        counts[row.collection_id] = (counts[row.collection_id] ?? 0) + 1;

    return {
      collections: ((collRes.data ?? []) as Collection[]).map((c) => ({
        ...c,
        count: counts[c.id] ?? 0,
      })),
    };
  });

  return (
    <div>
      <CatalogNav />

      <div className="mb-1 mt-6 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Sets
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Collections</h1>
      <p className="mt-2 text-meta text-muted">
        Group pieces into sets like “Winter” or “School”. Anything filed into a
        collection leaves the main feed and lives here instead.
      </p>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && data.collections.length === 0 && (
        <p className="mt-6 text-meta text-muted">
          No collections yet. Give an item a collection name when adding or
          editing it, and it’ll appear here.
        </p>
      )}

      {data && data.collections.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {data.collections.map((c) => (
            <CollectionCard key={c.id} collection={c} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionCard({
  collection,
  onChanged,
}: {
  collection: WithCount;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = name.trim();
    if (!next || next === collection.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await renameCollection(createClient(), collection.id, next);
      setEditing(false);
      onChanged();
    } catch (e) {
      alert(`Couldn’t rename: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const n = collection.count;
    if (
      !confirm(
        `Delete the “${collection.name}” collection?\n\n` +
          (n > 0
            ? `Its ${n} item${n === 1 ? "" : "s"} will return to your main feed — they won’t be deleted.`
            : `It’s empty, so nothing else changes.`),
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCollection(createClient(), collection.id);
      onChanged();
    } catch (e) {
      alert(`Couldn’t delete: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-card border border-accent/60 bg-card p-5">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setName(collection.name);
              setEditing(false);
            }
          }}
          className="input font-serif text-xl"
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="btn-accent flex-1 disabled:opacity-50"
          >
            Save
          </button>
          <button
            onClick={() => {
              setName(collection.name);
              setEditing(false);
            }}
            className="btn-ghost"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-card border border-line bg-card p-5 transition-all hover:border-accent/60 hover:shadow-lift">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      {/* Hover actions: rename / delete. Sit above the card link. */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn label="Rename" onClick={() => setEditing(true)} disabled={busy}>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </IconBtn>
        <IconBtn label="Delete" onClick={remove} disabled={busy} danger>
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
        </IconBtn>
      </div>

      <Link href={`/collections?id=${collection.id}`} className="block">
        <div className="font-serif text-2xl leading-tight">
          {collection.name}
        </div>
        <div className="mt-3 text-meta text-muted tnum">
          <span className="text-accentSoft">{collection.count}</span> items
        </div>
      </Link>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "rounded-full border border-line bg-black/40 p-1.5 text-muted backdrop-blur transition-colors disabled:opacity-40 " +
        (danger
          ? "hover:border-accent hover:text-accentSoft"
          : "hover:border-accent/60 hover:text-ink")
      }
    >
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}
