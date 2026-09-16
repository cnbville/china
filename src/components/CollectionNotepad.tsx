"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Collection } from "@/lib/types";

// A checklist, scoped per collection (or "General" for the whole catalog).
// Think grocery/to-buy list: add items, tick them off, remove them. Autosaves,
// debounced, to the `notes` table so the list syncs across devices.

type Item = { id: string; text: string; done: boolean };

function uid(): string {
  return crypto.randomUUID();
}

// Read whatever is stored (new JSON, or an older freeform note) into items.
function parseBody(body: string | null | undefined): Item[] {
  const raw = (body ?? "").trim();
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : Array.isArray(j?.items) ? j.items : null;
    if (arr) {
      return arr
        .map((it: unknown) => {
          const o = (it ?? {}) as { text?: unknown; done?: unknown };
          return {
            id: uid(),
            text: typeof o.text === "string" ? o.text : String(o.text ?? ""),
            done: !!o.done,
          };
        })
        .filter((i: Item) => i.text.trim() !== "");
    }
  } catch {
    /* not JSON — fall through to legacy freeform parsing */
  }
  // Legacy: one unchecked item per non-empty line, stripping any "- [ ]" marks.
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^[-*]\s*\[( |x|X)\]\s*(.*)$/);
      return {
        id: uid(),
        text: m ? m[2] : line,
        done: m ? m[1].toLowerCase() === "x" : false,
      };
    });
}

function serialize(items: Item[]): string {
  return JSON.stringify({
    items: items
      .filter((i) => i.text.trim() !== "")
      .map((i) => ({ text: i.text, done: i.done })),
  });
}

export function CollectionNotepad() {
  const supabase = useMemo(() => createClient(), []);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sel, setSel] = useState("general");
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKey = useRef<string | null>(null);

  const key = sel === "general" ? "general" : `collection:${sel}`;
  const remaining = items.filter((i) => !i.done).length;

  useEffect(() => {
    supabase
      .from("collections")
      .select("*")
      .order("name")
      .then(({ data }) => setCollections((data ?? []) as Collection[]));
  }, [supabase]);

  // Load the list for the selected scope.
  useEffect(() => {
    let alive = true;
    loadedKey.current = null;
    setStatus("");
    supabase
      .from("notes")
      .select("body")
      .eq("key", key)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setItems(parseBody(data?.body as string | undefined));
        loadedKey.current = key;
      });
    return () => {
      alive = false;
    };
  }, [key, supabase]);

  // Persist after any change, debounced.
  function persist(next: Item[]) {
    if (loadedKey.current !== key) return; // ignore until the load settled
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("notes")
        .upsert({ key, body: serialize(next) }, { onConflict: "key" });
      setStatus(error ? "error" : "saved");
    }, 600);
  }

  function mutate(next: Item[]) {
    setItems(next);
    persist(next);
  }

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    mutate([...items, { id: uid(), text, done: false }]);
    setDraft("");
  }

  function toggle(id: string) {
    mutate(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function edit(id: string, text: string) {
    mutate(items.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  function remove(id: string) {
    mutate(items.filter((i) => i.id !== id));
  }

  function clearDone() {
    mutate(items.filter((i) => !i.done));
  }

  const doneCount = items.length - remaining;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-1 rounded-pill bg-accent shadow-glow" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
            List
          </span>
        </div>
        <span className="text-[10px] text-muted">
          {status === "saving"
            ? "saving…"
            : status === "saved"
              ? "saved ✓"
              : status === "error"
                ? "!"
                : items.length > 0
                  ? `${remaining} left`
                  : ""}
        </span>
      </div>

      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="mb-2 w-full rounded-card border border-line bg-card px-2 py-1 text-meta text-muted"
      >
        <option value="general">General</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="rounded-card border border-line bg-surface2/50 p-2">
        {/* Add row */}
        <div className="flex items-center gap-2 px-1 pb-1.5">
          <span className="text-muted">+</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add an item…"
            className="w-full bg-transparent text-body text-ink outline-none placeholder:text-muted/60"
          />
        </div>

        {items.length > 0 && (
          <ul className="mt-1 space-y-0.5 border-t border-line/60 pt-1.5">
            {items.map((item) => (
              <li key={item.id} className="group flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={item.done}
                  title={item.done ? "Mark not done" : "Mark done"}
                  className={
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors " +
                    (item.done
                      ? "border-accent bg-accent text-white"
                      : "border-line hover:border-accent/70")
                  }
                >
                  {item.done && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 6" />
                    </svg>
                  )}
                </button>

                <input
                  value={item.text}
                  onChange={(e) => edit(item.id, e.target.value)}
                  className={
                    "w-full bg-transparent py-0.5 text-body outline-none transition-colors " +
                    (item.done
                      ? "text-muted line-through"
                      : "text-ink")
                  }
                />

                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  title="Remove"
                  className="shrink-0 text-muted opacity-0 transition-opacity hover:text-accentSoft group-hover:opacity-100"
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
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && (
          <p className="px-1 pt-1 text-meta text-muted/70">
            Nothing yet — add an item above.
          </p>
        )}
      </div>

      {doneCount > 0 && (
        <button
          type="button"
          onClick={clearDone}
          className="mt-1.5 text-[11px] text-muted underline hover:text-ink"
        >
          Clear {doneCount} checked
        </button>
      )}
    </div>
  );
}
