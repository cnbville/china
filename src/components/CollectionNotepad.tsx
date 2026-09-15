"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Collection } from "@/lib/types";

// A quiet notepad, scoped per collection (or "General" for the whole catalog).
// Autosaves, debounced, to the `notes` table so notes sync across devices.
export function CollectionNotepad() {
  const supabase = useMemo(() => createClient(), []);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sel, setSel] = useState("general");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKey = useRef<string | null>(null);

  const key = sel === "general" ? "general" : `collection:${sel}`;

  useEffect(() => {
    supabase
      .from("collections")
      .select("*")
      .order("name")
      .then(({ data }) => setCollections((data ?? []) as Collection[]));
  }, [supabase]);

  // Load the note for the selected scope.
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
        setBody((data?.body as string) ?? "");
        loadedKey.current = key;
      });
    return () => {
      alive = false;
    };
  }, [key, supabase]);

  function onChange(v: string) {
    setBody(v);
    if (loadedKey.current !== key) return; // ignore until the load settled
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("notes")
        .upsert({ key, body: v }, { onConflict: "key" });
      setStatus(error ? "error" : "saved");
    }, 600);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-3 w-1 rounded-pill bg-accent shadow-glow" />
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
            Notes
          </span>
        </div>
        <span className="text-[10px] text-muted">
          {status === "saving"
            ? "saving…"
            : status === "saved"
              ? "saved ✓"
              : status === "error"
                ? "!"
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

      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Jot ideas, follow-ups, measurements…"
        rows={7}
        className="w-full resize-none rounded-card border border-line bg-surface2/50 p-3 text-body leading-relaxed text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)" }}
      />
    </div>
  );
}
