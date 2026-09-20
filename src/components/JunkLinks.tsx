"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { linkKey } from "@/lib/linkKey";
import type { JunkLink } from "@/lib/types";

// "Junk": the scratch drawer. Just a link + a note, dumped fast and listed
// newest-first. No labels, filters, or promotion — kept intentionally bare and
// separate from Later. Somewhere to throw a URL so you don't lose it.

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

export function JunkLinks() {
  const { data, loading, error, refetch } = useLiveData<JunkLink[]>(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("junk_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as JunkLink[];
  });

  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const links = useMemo(() => data ?? [], [data]);

  async function add() {
    const u = normalizeUrl(url);
    if (!u) {
      setMsg("Paste a link first.");
      return;
    }
    const key = linkKey(u);
    if (links.some((l) => linkKey(l.url) === key)) {
      setMsg("You've already got this link in here.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient()
      .from("junk_links")
      .insert({ url: u, note: note.trim() || null });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setUrl("");
    setNote("");
    refetch();
  }

  async function remove(id: string) {
    await createClient().from("junk_links").delete().eq("id", id);
    refetch();
  }

  return (
    <div>
      <div className="mb-1 mt-2 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Scratch drawer
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Junk</h1>
      <p className="mt-2 max-w-prose text-meta text-muted">
        Throw a link and a note in here so you don&rsquo;t lose it. No
        organising — just a quick dump, newest on top.
      </p>

      {/* Add bar */}
      <div className="mt-6 rounded-card border border-line bg-card/70 p-3 shadow-lift">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Paste a link…"
          className="input"
          inputMode="url"
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Quick note — what is it?"
            className="input flex-1"
          />
          <button
            onClick={add}
            disabled={busy}
            className="btn-accent shrink-0 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {msg && <p className="mt-2 text-meta text-accentSoft">{msg}</p>}
      </div>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && links.length === 0 && (
        <div className="mt-8 rounded-card border border-dashed border-line p-10 text-center">
          <p className="text-body text-muted">Empty drawer.</p>
          <p className="mt-1 text-meta text-muted/70">
            Paste a link above to stash it.
          </p>
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-6 space-y-2">
          {links.map((l) => {
            const host = hostOf(l.url);
            return (
              <li
                key={l.id}
                className="group flex items-start gap-3 rounded-card border border-line bg-card/50 p-3 transition-colors hover:border-accent/40 hover:bg-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-body text-ink">
                    {l.note || host}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <span className="truncate">{host}</span>
                    <span className="text-line">·</span>
                    <span className="tnum">{fmtDate(l.created_at)}</span>
                  </div>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-pill px-2.5 py-1 text-meta text-accentSoft/90 transition-colors hover:bg-surface2 hover:text-accentSoft"
                >
                  Open ↗
                </a>
                <button
                  onClick={() => remove(l.id)}
                  title="Remove"
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
