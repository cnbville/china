"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { SourceFields } from "@/components/SourceFields";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/signedUrls";
import {
  deleteItemFully,
  listCategories,
  listCollections,
  resolveCategoryId,
  resolveCollectionId,
} from "@/lib/catalog";
import {
  compareSources,
  draftFromSource,
  draftToPayload,
  emptySourceDraft,
  type SourceDraft,
} from "@/lib/source";
import type { Category, Collection, Item, Source } from "@/lib/types";

type Data = {
  item: Item;
  sources: Source[];
  collections: Collection[];
  categories: Category[];
};

export function ItemView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const { data, loading, error, refetch } = useLiveData<Data>(async () => {
    const [itemRes, srcRes, colls, cats] = await Promise.all([
      supabase.from("items").select("*").eq("id", itemId).single(),
      supabase.from("sources").select("*").eq("item_id", itemId),
      listCollections(supabase),
      listCategories(supabase),
    ]);
    if (itemRes.error) throw itemRes.error;
    if (srcRes.error) throw srcRes.error;
    return {
      item: itemRes.data as Item,
      sources: (srcRes.data ?? []) as Source[],
      collections: colls,
      categories: cats,
    };
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {error && <p className="text-meta text-accent">{error}</p>}
        {loading && !data && <p className="text-meta text-muted">Loading…</p>}
        {data && (
          <ItemBody
            key={data.item.id}
            data={data}
            supabase={supabase}
            refetch={refetch}
            onDeleted={() => {
              router.replace("/");
              router.refresh();
            }}
          />
        )}
      </main>
    </>
  );
}

// Split out so editable local state is initialised once per item (via `key`),
// and not clobbered by focus/realtime refetches while editing.
function ItemBody({
  data,
  supabase,
  refetch,
  onDeleted,
}: {
  data: Data;
  supabase: ReturnType<typeof createClient>;
  refetch: () => Promise<void>;
  onDeleted: () => void;
}) {
  const { item } = data;
  const collName =
    data.collections.find((c) => c.id === item.collection_id)?.name ?? "";
  const catName =
    data.categories.find((c) => c.id === item.category_id)?.name ?? "";

  const [fields, setFields] = useState({
    title: item.title,
    type: item.type ?? "",
    brand: item.brand ?? "",
    notes: item.notes ?? "",
    collection: collName,
    category: catName,
  });
  const [liked, setLiked] = useState(item.liked);
  const [wanted, setWanted] = useState(item.wanted);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  useEffect(() => {
    getSignedUrl(supabase, item.photo_path).then(setPhotoUrl).catch(() => {});
  }, [supabase, item.photo_path]);

  async function patchItem(patch: Record<string, unknown>) {
    const { error } = await supabase.from("items").update(patch).eq("id", item.id);
    if (error) setBusyMsg(error.message);
    else refetch();
  }

  async function saveCollection(name: string) {
    const id = await resolveCollectionId(supabase, name);
    patchItem({ collection_id: id });
  }
  async function saveCategory(name: string) {
    const id = await resolveCategoryId(supabase, name);
    patchItem({ category_id: id });
  }

  async function onDelete() {
    if (
      !confirm(
        "Delete this item and all its links? This can't be undone.",
      )
    )
      return;
    setBusyMsg("Deleting…");
    try {
      await deleteItemFully(supabase, item);
      onDeleted();
    } catch (e) {
      setBusyMsg(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  const sorted = [...data.sources].sort(compareSources);

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,20rem)_1fr]">
      {/* Photo */}
      <div>
        <div className="photo-frame rounded-card border border-line">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={item.title} />
          ) : (
            <div className="flex h-full items-center justify-center text-meta text-muted">
              no photo
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-6">
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={liked}
              onChange={(e) => {
                setLiked(e.target.checked);
                patchItem({ liked: e.target.checked });
              }}
            />
            Like
          </label>
          <label className="flex items-center gap-2 text-body">
            <input
              type="checkbox"
              checked={wanted}
              onChange={(e) => {
                setWanted(e.target.checked);
                patchItem({ wanted: e.target.checked });
              }}
            />
            Want
          </label>
        </div>

        <button
          onClick={onDelete}
          className="mt-6 text-meta text-muted underline hover:text-accent"
        >
          Delete item
        </button>
        {busyMsg && <p className="mt-2 text-meta text-accent">{busyMsg}</p>}
      </div>

      {/* Details + sources */}
      <div>
        <input
          value={fields.title}
          onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
          onBlur={() => patchItem({ title: fields.title.trim() || item.title })}
          className="w-full border-none bg-transparent font-serif text-3xl outline-none focus:underline"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <LabeledInput
            label="Type"
            value={fields.type}
            onChange={(v) => setFields((f) => ({ ...f, type: v }))}
            onBlur={() => patchItem({ type: fields.type.trim() || null })}
          />
          <LabeledInput
            label="Brand"
            value={fields.brand}
            onChange={(v) => setFields((f) => ({ ...f, brand: v }))}
            onBlur={() => patchItem({ brand: fields.brand.trim() || null })}
          />
          <LabeledInput
            label="Collection"
            value={fields.collection}
            list="coll-list"
            onChange={(v) => setFields((f) => ({ ...f, collection: v }))}
            onBlur={() => saveCollection(fields.collection)}
          />
          <LabeledInput
            label="Category"
            value={fields.category}
            list="cat-list"
            onChange={(v) => setFields((f) => ({ ...f, category: v }))}
            onBlur={() => saveCategory(fields.category)}
          />
          <datalist id="coll-list">
            {data.collections.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <datalist id="cat-list">
            {data.categories.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>

        <div className="mt-3">
          <label className="block text-meta text-muted">Notes</label>
          <textarea
            rows={2}
            value={fields.notes}
            onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
            onBlur={() => patchItem({ notes: fields.notes.trim() || null })}
            className="input mt-1"
          />
        </div>

        <SourcesSection
          itemId={item.id}
          sources={sorted}
          supabase={supabase}
          refetch={refetch}
        />
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  onBlur,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  list?: string;
}) {
  return (
    <div>
      <label className="block text-meta text-muted">{label}</label>
      <input
        className="input mt-1"
        value={value}
        list={list}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

function SourcesSection({
  itemId,
  sources,
  supabase,
  refetch,
}: {
  itemId: string;
  sources: Source[];
  supabase: ReturnType<typeof createClient>;
  refetch: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<SourceDraft>(emptySourceDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SourceDraft>(emptySourceDraft);
  const [msg, setMsg] = useState<string | null>(null);
  const addRef = useRef<HTMLDivElement>(null);

  async function addSource() {
    const payload = draftToPayload(addDraft);
    if (!payload.ok) return setMsg(payload.error);
    const { error } = await supabase
      .from("sources")
      .insert({ item_id: itemId, ...payload.value });
    if (error) {
      // Unique (item_id, url) violation — the link is already saved here.
      setMsg(
        error.code === "23505"
          ? "That link is already saved here."
          : error.message,
      );
      return;
    }
    setAddDraft(emptySourceDraft);
    setAdding(false);
    setMsg(null);
    refetch();
  }

  async function saveEdit(id: string) {
    const payload = draftToPayload(editDraft);
    if (!payload.ok) return setMsg(payload.error);
    const { error } = await supabase
      .from("sources")
      .update(payload.value)
      .eq("id", id);
    if (error) {
      setMsg(
        error.code === "23505"
          ? "That link is already saved here."
          : error.message,
      );
      return;
    }
    setEditId(null);
    setMsg(null);
    refetch();
  }

  async function deleteSource(id: string) {
    // No confirm — losing one link is cheap (plan section 2).
    const { error } = await supabase.from("sources").delete().eq("id", id);
    if (error) setMsg(error.message);
    else refetch();
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Sources</h2>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setMsg(null);
              setTimeout(
                () => addRef.current?.scrollIntoView({ behavior: "smooth" }),
                0,
              );
            }}
            className="rounded-card border border-line px-3 py-1.5 text-meta hover:border-ink"
          >
            Add source
          </button>
        )}
      </div>

      {msg && <p className="mt-2 text-meta text-accent">{msg}</p>}

      <ul className="mt-4 space-y-3">
        {sources.map((s) =>
          editId === s.id ? (
            <li
              key={s.id}
              className="rounded-card border border-accent bg-card p-4"
            >
              <SourceFields draft={editDraft} onChange={setEditDraft} />
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => saveEdit(s.id)}
                  className="rounded-card bg-ink px-3 py-1.5 text-meta text-paper"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditId(null);
                    setMsg(null);
                  }}
                  className="text-meta text-muted hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <SourceRow
              key={s.id}
              source={s}
              onEdit={() => {
                setEditId(s.id);
                setEditDraft(draftFromSource(s));
                setMsg(null);
              }}
              onDelete={() => deleteSource(s.id)}
            />
          ),
        )}
      </ul>

      {adding && (
        <div
          ref={addRef}
          className="mt-4 rounded-card border border-line bg-card p-4"
        >
          <h3 className="mb-3 text-meta uppercase tracking-widest text-muted">
            New source
          </h3>
          <SourceFields draft={addDraft} onChange={setAddDraft} />
          <div className="mt-3 flex gap-3">
            <button
              onClick={addSource}
              className="rounded-card bg-ink px-3 py-1.5 text-meta text-paper"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setAddDraft(emptySourceDraft);
                setMsg(null);
              }}
              className="text-meta text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sources.length === 0 && !adding && (
        <p className="mt-3 text-meta text-muted">No sources yet.</p>
      )}
    </section>
  );
}

function SourceRow({
  source,
  onEdit,
  onDelete,
}: {
  source: Source;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-card p-3">
      {/* Rank badge: small filled square, accent, tabular number. Unranked gets
          no badge at all (plan section 6). */}
      {source.rank != null ? (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-accent text-meta text-paper tnum">
          {source.rank}
        </span>
      ) : (
        <span className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body">
            {source.seller_name || "(unnamed seller)"}
          </span>
          <span className="ml-auto whitespace-nowrap text-body tnum">
            {source.price != null ? `¥${formatPrice(source.price)}` : "—"}
          </span>
        </div>

        <div className="mt-0.5 text-meta text-muted tnum">
          {source.colors.length} colors · {source.sizes.length} sizes
          {source.moq != null ? ` · MOQ ${source.moq}` : ""}
        </div>

        {source.reasons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {source.reasons.map((r) => (
              <span
                key={r}
                className="rounded-card border border-line px-1.5 py-0.5 text-[11px] text-muted"
              >
                {r}
              </span>
            ))}
          </div>
        )}

        {source.notes && (
          <p className="mt-1.5 text-meta text-muted">{source.notes}</p>
        )}

        <div className="mt-2 flex items-center gap-3 text-meta">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Open link ↗
          </a>
          <button onClick={onEdit} className="text-muted hover:text-ink">
            Edit
          </button>
          <button onClick={onDelete} className="text-muted hover:text-ink">
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function formatPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
