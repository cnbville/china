"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { PhotoInput } from "@/components/PhotoInput";
import { SourceFields } from "@/components/SourceFields";
import { createClient } from "@/lib/supabase/client";
import {
  listCategories,
  listCollections,
  resolveCategoryId,
  resolveCollectionId,
  uploadPhoto,
} from "@/lib/catalog";
import { draftToPayload, emptySourceDraft, type SourceDraft } from "@/lib/source";
import {
  fetchImportImage,
  importImageUrls,
  readImportFromHash,
} from "@/lib/import";
import { linkKey } from "@/lib/linkKey";
import type { Category, Collection } from "@/lib/types";

// Where a link already lives, for the duplicate-link warning.
type LinkHit = { where: "item" | "later" | "junk"; itemId?: string; title?: string };

const DRAFT_KEY = "add-item-draft:v1";

// Everything typed, minus the image file (blobs don't serialize). Persisted to
// localStorage until the insert succeeds, so a dropped upload loses nothing.
type ItemDraft = {
  title: string;
  type: string;
  brand: string;
  collection: string;
  category: string;
  notes: string;
  liked: boolean;
  wanted: boolean;
  source: SourceDraft;
};

const emptyItemDraft: ItemDraft = {
  title: "",
  type: "",
  brand: "",
  collection: "",
  category: "",
  notes: "",
  liked: false,
  wanted: false,
  source: emptySourceDraft,
};

export default function AddItemPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<ItemDraft>(emptyItemDraft);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null while the quick-import is re-hosting photos; carries progress + a
  // closing note (e.g. some images couldn't be fetched).
  const [importing, setImporting] = useState<{
    done: number;
    total: number;
    note?: string;
  } | null>(null);
  // Index of every link you already have (sources / Later / Junk), keyed by
  // canonical URL, so we can warn on a duplicate as you type or import.
  const [linkIndex, setLinkIndex] = useState<Map<string, LinkHit>>(new Map());
  const loadedDraft = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const idx = new Map<string, LinkHit>();
      const put = (k: string, hit: LinkHit) => {
        if (k && !idx.has(k)) idx.set(k, hit);
      };
      try {
        const [{ data: srcs }, { data: items }] = await Promise.all([
          supabase.from("sources").select("url, item_id"),
          supabase.from("items").select("id, title"),
        ]);
        const titleById = new Map(
          ((items ?? []) as { id: string; title: string }[]).map((i) => [
            i.id,
            i.title,
          ]),
        );
        for (const r of (srcs ?? []) as { url: string; item_id: string | null }[]) {
          put(linkKey(r.url), {
            where: "item",
            itemId: r.item_id ?? undefined,
            title: r.item_id ? titleById.get(r.item_id) : undefined,
          });
        }
      } catch {
        /* ignore */
      }
      // Later + Junk are optional (tables may not exist yet) — don't let a
      // missing table break the whole index.
      try {
        const { data } = await supabase.from("saved_links").select("url");
        for (const r of (data ?? []) as { url: string }[])
          put(linkKey(r.url), { where: "later" });
      } catch {
        /* ignore */
      }
      try {
        const { data } = await supabase.from("junk_links").select("url");
        for (const r of (data ?? []) as { url: string }[])
          put(linkKey(r.url), { where: "junk" });
      } catch {
        /* ignore */
      }
      setLinkIndex(idx);
    })();
  }, []);

  // On mount: load the datalists, then either apply a quick-import payload from
  // the URL hash (bookmarklet) or restore a saved draft. Import wins over a stale
  // draft — it's the deliberate, fresher intent.
  useEffect(() => {
    const supabase = createClient();
    listCollections(supabase).then(setCollections).catch(() => {});
    listCategories(supabase).then(setCategories).catch(() => {});

    const imported = readImportFromHash();
    if (imported) {
      // Drop the hash so a refresh doesn't re-import.
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      setDraft({
        ...emptyItemDraft,
        title: imported.title?.trim() ?? "",
        source: {
          ...emptySourceDraft,
          url: imported.url?.trim() ?? "",
          seller_name: imported.seller?.trim() ?? "",
          price: imported.price?.trim() ?? "",
          moq: imported.moq?.trim() ?? "",
          colors: imported.colors ?? [],
          sizes: imported.sizes ?? [],
        },
      });
      loadedDraft.current = true;

      const urls = importImageUrls(imported);
      if (urls.length > 0) {
        setImporting({ done: 0, total: urls.length });
        (async () => {
          const collected: File[] = [];
          for (let i = 0; i < urls.length; i++) {
            const file = await fetchImportImage(supabase, urls[i], i);
            if (file) collected.push(file);
            setImporting({ done: i + 1, total: urls.length });
          }
          setFiles(collected);
          const missed = urls.length - collected.length;
          setImporting(
            missed > 0
              ? {
                  done: urls.length,
                  total: urls.length,
                  note: `${collected.length}/${urls.length} photos imported — add the rest by hand.`,
                }
              : null,
          );
        })();
      }
      return;
    }

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDraft({ ...emptyItemDraft, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed draft */
    }
    loadedDraft.current = true;
  }, []);

  // Persist the draft on every change (after the initial restore).
  useEffect(() => {
    if (!loadedDraft.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [draft]);

  // Abandon the draft when you leave the page (back out / navigate away). A hard
  // reload doesn't run this cleanup, so an accidental refresh still restores your
  // work; only a deliberate exit clears it, so the form is fresh next time.
  useEffect(() => {
    return () => {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Duplicate-link warning: does the source URL already exist somewhere?
  const dupe = draft.source.url.trim()
    ? linkIndex.get(linkKey(draft.source.url))
    : undefined;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!draft.title.trim()) {
      setError("Give the item a title.");
      return;
    }
    const payload = draftToPayload(draft.source);
    if (!payload.ok) {
      setError(payload.error);
      return;
    }

    setBusy(true);
    const supabase = createClient();
    // Generate the id up front so the photo uploads before the row is inserted.
    // If the upload dies, no item row is created and the draft is intact — retry
    // just works.
    const itemId = crypto.randomUUID();

    try {
      // Upload every photo first; the first one is the cover.
      const uploaded: { photo_path: string; thumb_path: string }[] = [];
      for (const f of files) uploaded.push(await uploadPhoto(supabase, itemId, f));
      const cover = uploaded[0] ?? null;

      const [collection_id, category_id] = await Promise.all([
        resolveCollectionId(supabase, draft.collection),
        resolveCategoryId(supabase, draft.category),
      ]);

      const { error: itemErr } = await supabase.from("items").insert({
        id: itemId,
        title: draft.title.trim(),
        type: draft.type.trim() || null,
        brand: draft.brand.trim() || null,
        collection_id,
        category_id,
        notes: draft.notes.trim() || null,
        liked: draft.liked,
        wanted: draft.wanted,
        photo_path: cover?.photo_path ?? null,
        thumb_path: cover?.thumb_path ?? null,
      });
      if (itemErr) throw itemErr;

      // Record every uploaded photo in the item's gallery.
      if (uploaded.length > 0) {
        const { error: photoErr } = await supabase.from("item_photos").insert(
          uploaded.map((u, i) => ({
            item_id: itemId,
            photo_path: u.photo_path,
            thumb_path: u.thumb_path,
            position: i,
          })),
        );
        if (photoErr) throw photoErr;
      }

      const { error: srcErr } = await supabase
        .from("sources")
        .insert({ item_id: itemId, ...payload.value });
      if (srcErr) throw srcErr;

      // Success: drop the draft and go to the new item.
      localStorage.removeItem(DRAFT_KEY);
      router.replace(`/items?id=${itemId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item.");
      setBusy(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-3xl">Add item</h1>
          <Link
            href="/import"
            className="text-meta text-muted hover:text-accent"
            title="Set up 1-click import from a link"
          >
            ⚡ Quick import
          </Link>
        </div>

        {importing && (
          <div className="mt-4 rounded-card border border-line bg-surface2/40 px-4 py-3 text-meta">
            {importing.note ? (
              <span className="text-muted">{importing.note}</span>
            ) : (
              <span className="text-ink">
                Importing photos… {importing.done}/{importing.total}
              </span>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-8">
          <PhotoInput files={files} onFiles={setFiles} />

          <section className="space-y-4">
            <div>
              <label className="block text-meta text-muted">Title *</label>
              <input
                className="input mt-1"
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="boxy heavyweight hoodie"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-meta text-muted">Type</label>
                <input
                  className="input mt-1"
                  value={draft.type}
                  onChange={(e) => set("type", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-meta text-muted">Brand</label>
                <input
                  className="input mt-1"
                  value={draft.brand}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="reference brand, if any"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NamePicker
                label="Collection"
                options={collections}
                value={draft.collection}
                onChange={(v) => set("collection", v)}
              />
              <NamePicker
                label="Category"
                options={categories}
                value={draft.category}
                onChange={(v) => set("category", v)}
              />
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={draft.liked}
                  onChange={(e) => set("liked", e.target.checked)}
                />
                Like
              </label>
              <label className="flex items-center gap-2 text-body">
                <input
                  type="checkbox"
                  checked={draft.wanted}
                  onChange={(e) => set("wanted", e.target.checked)}
                />
                Want
              </label>
            </div>

            <div>
              <label className="block text-meta text-muted">Notes</label>
              <textarea
                className="input mt-1"
                rows={2}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </section>

          <section>
            <h2 className="font-serif text-xl">First source</h2>
            <p className="mb-3 mt-1 text-meta text-muted">
              The first link for this item. Add more from the item page.
            </p>
            {dupe && (
              <div className="mb-3 rounded-card border border-accent/50 bg-accent/10 px-4 py-3 text-meta text-ink">
                {dupe.where === "item" ? (
                  <>
                    ⚠ You&rsquo;ve already got this link
                    {dupe.itemId ? (
                      <>
                        {" — "}
                        <Link
                          href={`/items?id=${dupe.itemId}`}
                          className="underline hover:text-accentSoft"
                        >
                          {dupe.title || "open the item"} ↗
                        </Link>
                      </>
                    ) : (
                      " as an item"
                    )}
                    .
                  </>
                ) : (
                  <>
                    ⚠ This link is already in your{" "}
                    {dupe.where === "later" ? "Later" : "Junk"} list.
                  </>
                )}
              </div>
            )}
            <SourceFields
              draft={draft.source}
              onChange={(s) => set("source", s)}
            />
          </section>

          {error && <p className="text-meta text-accent">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="btn-accent disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save item"}
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setDraft(emptyItemDraft);
                setFiles([]);
              }}
              className="text-meta text-muted hover:text-ink"
            >
              Clear draft
            </button>
          </div>
        </form>
      </main>
    </>
  );
}

// Pick an existing collection/category from a dropdown (so what you already have
// is visible — a datalist hides its options until you type), or "＋ New…" to
// type a fresh name. Stores the name in the draft; it's resolved to an id (found
// or created) on save.
function NamePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const known = options.some(
    (o) => o.name.toLowerCase() === value.trim().toLowerCase(),
  );
  // A non-empty value that isn't an existing option is a new name in progress.
  const inCreate = creating || (!!value.trim() && !known);

  return (
    <div>
      <label className="block text-meta text-muted">{label}</label>
      {inCreate ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`New ${label.toLowerCase()}…`}
            className="input"
          />
          {options.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setCreating(false);
              }}
              className="whitespace-nowrap text-meta text-muted hover:text-ink"
            >
              Pick existing
            </button>
          )}
        </div>
      ) : (
        <select
          value={known ? value : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new__") {
              onChange("");
              setCreating(true);
            } else {
              onChange(v);
            }
          }}
          className="input mt-1"
        >
          <option value="">None</option>
          {options.map((o) => (
            <option key={o.id} value={o.name}>
              {o.name}
            </option>
          ))}
          <option value="__new__">＋ New {label.toLowerCase()}…</option>
        </select>
      )}
    </div>
  );
}
