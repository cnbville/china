"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import type { SavedLink } from "@/lib/types";

// "Later": a stash of factory links to look at later. A holding pen, separate
// from catalogued items — paste a URL, come back to it, then open it, promote
// it to an item, or bin it.

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
      year: "numeric",
    });
  } catch {
    return "";
  }
}
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

type SortKey = "newest" | "oldest" | "site" | "title";

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
  const [showDetails, setShowDetails] = useState(false);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [site, setSite] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const links = useMemo(() => data ?? [], [data]);

  // Top factories by number of stashed links, for the filter chips.
  const sites = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of links) counts[hostOf(l.url)] = (counts[hostOf(l.url)] ?? 0) + 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [links]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = links.filter((l) => {
      if (site && hostOf(l.url) !== site) return false;
      if (!t) return true;
      return [l.title, l.note, l.url, hostOf(l.url)].some((v) =>
        v?.toLowerCase().includes(t),
      );
    });
    list = [...list];
    switch (sort) {
      case "newest":
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        break;
      case "oldest":
        list.sort((a, b) => a.created_at.localeCompare(b.created_at));
        break;
      case "site":
        list.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)));
        break;
      case "title":
        list.sort((a, b) =>
          (a.title || hostOf(a.url)).localeCompare(b.title || hostOf(b.url)),
        );
        break;
    }
    return list;
  }, [links, q, site, sort]);

  async function add() {
    const u = normalizeUrl(url);
    if (!u) {
      setMsg("Paste a link first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().from("saved_links").insert({
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
    setShowDetails(false);
    refetch();
  }

  async function remove(id: string) {
    await createClient().from("saved_links").delete().eq("id", id);
    refetch();
  }

  async function copy(u: string, id: string) {
    try {
      await navigator.clipboard.writeText(u);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-1 mt-2 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          To review
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Later</h1>
      <p className="mt-2 max-w-prose text-meta text-muted">
        A holding pen for factory links you want to look at later — nothing here
        is in your catalog yet. Open one, save it as an item when you decide, or
        bin it.
      </p>

      {/* Add bar */}
      <div className="mt-6 rounded-card border border-line bg-card/70 p-3 shadow-lift">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-card border border-line bg-surface2/50 px-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="Paste a factory link and hit Enter…"
              className="w-full bg-transparent py-2.5 text-body text-ink outline-none placeholder:text-muted/70"
              inputMode="url"
            />
          </div>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="rounded-card border border-line px-3 py-2 text-meta text-muted transition-colors hover:text-ink"
            title="Add a label or note"
          >
            {showDetails ? "Less" : "＋ Details"}
          </button>
          <button
            onClick={add}
            disabled={busy}
            className="btn-accent disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {showDetails && (
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
        )}
        {msg && <p className="mt-2 text-meta text-accentSoft">{msg}</p>}
      </div>

      {error && <p className="mt-4 text-meta text-accentSoft">{error}</p>}
      {loading && !data && <p className="mt-6 text-meta text-muted">Loading…</p>}

      {data && links.length === 0 && (
        <div className="mt-8 rounded-card border border-dashed border-line p-10 text-center">
          <p className="text-body text-muted">Nothing stashed yet.</p>
          <p className="mt-1 text-meta text-muted/70">
            Paste a link above to come back to it later.
          </p>
        </div>
      )}

      {data && links.length > 0 && (
        <>
          {/* Controls */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-pill border border-line bg-card/60 px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4a7 7 0 1 0 4.2 12.6L20 21m-1.5-10A7 7 0 1 1 11 4Z" /></svg>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search links…"
                className="w-full bg-transparent py-1.5 text-meta text-ink outline-none placeholder:text-muted/70"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-pill border border-line bg-card px-3 py-1.5 text-meta text-muted"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="site">By site</option>
              <option value="title">By title</option>
            </select>
          </div>

          {/* Site filter chips */}
          {sites.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip active={site === null} onClick={() => setSite(null)}>
                All <span className="text-muted">· {links.length}</span>
              </Chip>
              {sites.map(([h, n]) => (
                <Chip key={h} active={site === h} onClick={() => setSite(site === h ? null : h)}>
                  {h} <span className="text-muted">· {n}</span>
                </Chip>
              ))}
            </div>
          )}

          <p className="mt-4 text-meta text-muted tnum">
            {shown.length} {shown.length === 1 ? "link" : "links"}
            {site ? ` at ${site}` : sites.length > 1 ? ` across ${sites.length} sites` : ""}
          </p>

          {/* Cards */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map((l) => {
              const host = hostOf(l.url);
              return (
                <div
                  key={l.id}
                  className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-card/50 transition-all hover:border-accent/40 hover:bg-card hover:shadow-lift"
                >
                  {/* accent hairline on hover */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                  <a href={l.url} target="_blank" rel="noreferrer" className="flex flex-1 gap-3 p-3">
                    <FaviconTile host={host} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body text-ink">
                        {l.title || host}
                      </div>
                      <div className="flex items-center gap-2 text-meta text-muted">
                        <span className="truncate">{host}</span>
                        <span className="text-line">·</span>
                        <span className="tnum">{fmtDate(l.created_at)}</span>
                      </div>
                      {l.note && (
                        <p className="mt-1.5 line-clamp-2 text-meta text-muted">
                          {l.note}
                        </p>
                      )}
                    </div>
                  </a>

                  <div className="flex items-center gap-1 border-t border-line/70 px-3 py-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-pill px-2.5 py-1 text-meta text-accentSoft/90 transition-colors hover:bg-surface2 hover:text-accentSoft"
                    >
                      Open ↗
                    </a>
                    <button
                      onClick={() => copy(l.url, l.id)}
                      className="rounded-pill px-2.5 py-1 text-meta text-muted transition-colors hover:bg-surface2 hover:text-ink"
                    >
                      {copied === l.id ? "Copied ✓" : "Copy"}
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      title="Remove"
                      className="ml-auto rounded-full p-1.5 text-muted transition-colors hover:text-accentSoft"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {shown.length === 0 && (
            <p className="mt-6 text-meta text-muted">No links match.</p>
          )}

          <p className="mt-8 text-meta text-muted">
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

function Chip({
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
      onClick={onClick}
      className={
        "rounded-pill border px-2.5 py-1 text-meta transition-colors " +
        (active
          ? "border-accent bg-accent/10 text-ink"
          : "border-line text-muted hover:border-ink/40 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

// A site favicon with a coloured monogram fallback (works offline / when the
// favicon service is blocked).
function FaviconTile({ host }: { host: string }) {
  const [ok, setOk] = useState(true);
  const hue = hueOf(host);
  const letter = (host.replace(/^www\./, "")[0] || "?").toUpperCase();
  return (
    <div
      className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[10px] font-serif text-lg text-white"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 45% 20%))`,
      }}
    >
      <span aria-hidden>{letter}</span>
      {ok && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          className="absolute inset-0 h-full w-full bg-white/90 object-contain p-2"
          onError={() => setOk(false)}
          loading="lazy"
        />
      )}
    </div>
  );
}
