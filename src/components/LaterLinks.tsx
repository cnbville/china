"use client";

import { useState } from "react";
import Link from "next/link";
import { CatalogNav } from "@/components/CatalogNav";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { SavedLink } from "@/lib/types";

// "Later": a stash of factory links to look at later. A holding pen, separate
// from catalogued items — paste a URL, come back to it, then either open it,
// promote it to an item, or bin it.

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function LaterLinks() {
  const { data, loading, error, refetch } = useLiveData<SavedLink[]>(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedLink[];
  });

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    const u = normalizeUrl(url);
    if (!u) {
      setMsg("Paste a link first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.from("saved_links").insert({
      url: u,
      title: title.trim() || null,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setUrl("");
    setTitle("");
    setNote("");
    refetch();
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("saved_links").delete().eq("id", id);
    refetch();
  }

  const links = data ?? [];

  return (
    <div>
      <CatalogNav />

      <div className="mb-1 mt-6 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          To review
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Later</h1>
      <p className="mt-2 text-meta text-muted">
        Stash factory links you want to look at later. Nothing here is in your
        catalog yet — open one, save it as an item when you decide, or bin it.
      </p>

      {/* Add form */}
      <div className="mt-6 rounded-card border border-line bg-card/70 p-4 shadow-lift">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          placeholder="Paste a factory link…"
          className="input"
          inputMode="url"
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Label / seller (optional)"
            className="input"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to self (optional)"
            className="input"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={add}
            disabled={busy}
            className="btn-accent disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save link"}
          </button>
          {msg && <span className="text-meta text-accentSoft">{msg}</span>}
        </div>
      </div>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && (
        <>
          <p className="mt-6 text-meta text-muted tnum">
            {links.length} {links.length === 1 ? "link" : "links"}
          </p>

          {links.length === 0 ? (
            <p className="mt-3 text-meta text-muted">
              Nothing stashed yet. Paste a link above to come back to it later.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {links.map((l) => (
                <li
                  key={l.id}
                  className="group flex items-start gap-3 rounded-card border border-line bg-card/50 p-3 transition-colors hover:border-accent/40 hover:bg-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-body text-ink">
                        {l.title || hostOf(l.url)}
                      </span>
                      <span className="text-meta text-muted">
                        {hostOf(l.url)}
                      </span>
                      <span className="text-meta text-muted tnum">
                        · {fmtDate(l.created_at)}
                      </span>
                    </div>
                    {l.note && (
                      <p className="mt-1 text-meta text-muted">{l.note}</p>
                    )}
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-meta text-accentSoft/80 underline decoration-line hover:decoration-accent"
                    >
                      {l.url}
                    </a>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open in new tab"
                      className="rounded-pill border border-line bg-card/60 px-3 py-1.5 text-meta text-muted transition-colors hover:border-accent/60 hover:text-ink"
                    >
                      Open ↗
                    </a>
                    <button
                      onClick={() => remove(l.id)}
                      title="Remove"
                      className="rounded-full border border-line p-1.5 text-muted transition-colors hover:border-accent hover:text-accentSoft"
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
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 text-meta text-muted">
            Ready to catalog one?{" "}
            <Link href="/items/new" className="underline hover:text-ink">
              Add it as an item
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
