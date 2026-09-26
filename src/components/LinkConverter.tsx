"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGENTS,
  buildAgentLink,
  detectAgent,
  marketplaceUrl,
  parseLink,
  type Marketplace,
} from "@/lib/links";

// Paste any direct or agent link → get it in every agent's format, copy the one
// you want. All local, no network. Encrypted/shortened links (m.tb.cn, …) can't
// be resolved here yet.
const FAV_KEY = "link-fav-agent";

const MP: Record<Marketplace, { label: string; hue: number }> = {
  taobao: { label: "Taobao", hue: 28 },
  tmall: { label: "Tmall", hue: 348 },
  weidian: { label: "Weidian", hue: 12 },
  "1688": { label: "1688", hue: 36 },
};

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function LinkConverter() {
  const [input, setInput] = useState("");
  const [fav, setFav] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    try {
      const f = localStorage.getItem(FAV_KEY);
      if (f && AGENTS.some((a) => a.key === f)) setFav(f);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleFav(key: string) {
    const next = fav === key ? null : key;
    setFav(next);
    try {
      if (next) localStorage.setItem(FAV_KEY, next);
      else localStorage.removeItem(FAV_KEY);
    } catch {
      /* ignore */
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
    } catch {
      /* ignore */
    }
  }

  const parsed = useMemo(() => (input.trim() ? parseLink(input) : null), [input]);
  const sourceAgent = useMemo(
    () => (input.trim() ? detectAgent(input) : null),
    [input],
  );
  const directUrl = parsed ? marketplaceUrl(parsed.marketplace, parsed.id) : null;

  // Agent cards, favourite first.
  const ordered = useMemo(() => {
    const list = [...AGENTS];
    list.sort((a, b) => {
      if (a.key === fav) return -1;
      if (b.key === fav) return 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [fav]);

  const looksEncrypted =
    !parsed &&
    input.trim().length > 0 &&
    /m\.tb\.cn|(^|\.)tb\.cn|page\.link|\.cc\/|sl\.|short/i.test(input);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Tools
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Link converter</h1>
      <p className="mt-2 max-w-prose text-meta text-muted">
        Paste a Taobao / Weidian / 1688 link — direct or from any agent — and grab
        it in whichever agent you use. Star your favourite to keep it on top.
      </p>

      {/* Paste box */}
      <div className="mt-6 rounded-card border border-line bg-card/70 p-4 shadow-lift">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste any product or agent link…"
          rows={2}
          autoFocus
          className="w-full resize-none bg-transparent font-mono text-[12px] leading-snug text-ink outline-none placeholder:text-muted/60"
        />
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2">
          {parsed ? (
            <div className="flex min-w-0 items-center gap-2 text-meta">
              <span
                className="shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium text-white"
                style={{
                  background: `linear-gradient(135deg, hsl(${MP[parsed.marketplace].hue} 70% 45%), hsl(${MP[parsed.marketplace].hue} 70% 38%))`,
                }}
              >
                {MP[parsed.marketplace].label}
              </span>
              <span className="truncate tnum text-ink">{parsed.id}</span>
              {sourceAgent && (
                <span className="shrink-0 text-muted">· via {sourceAgent.name}</span>
              )}
            </div>
          ) : looksEncrypted ? (
            <span className="text-meta text-accentSoft">
              Encrypted/short link — needs a server to unwrap (coming). Open it &
              paste the real URL.
            </span>
          ) : input.trim() ? (
            <span className="text-meta text-muted">Couldn&rsquo;t read a product.</span>
          ) : (
            <span className="text-meta text-muted/70">
              Taobao · Tmall · Weidian · 1688
            </span>
          )}
          {input && (
            <button
              onClick={() => setInput("")}
              className="shrink-0 text-meta text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Direct link */}
      {parsed && directUrl && (
        <button
          onClick={() => copy("__direct__", directUrl)}
          className="mt-3 flex w-full items-center gap-2 rounded-card border border-line bg-surface2/40 px-3 py-2 text-left text-meta transition-colors hover:border-accent/40 hover:bg-card"
        >
          <span className="text-muted">Direct {MP[parsed.marketplace].label} link</span>
          <span className="ml-auto text-accentSoft">
            {copied === "__direct__" ? "Copied ✓" : "Copy"}
          </span>
        </button>
      )}

      {/* Agent grid */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ordered.map((a) => {
          const link = parsed ? buildAgentLink(a.key, parsed) : null;
          const isFav = fav === a.key;
          const isCopied = copied === a.key;
          return (
            <div
              key={a.key}
              className={
                "group flex items-center gap-2.5 rounded-card border p-2.5 transition-colors " +
                (isFav
                  ? "border-accent/70 bg-accent/5"
                  : "border-line bg-card/50 hover:border-accent/30")
              }
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] font-serif text-sm text-white"
                style={{
                  background: `linear-gradient(145deg, hsl(${hueOf(a.name)} 55% 34%), hsl(${(hueOf(a.name) + 40) % 360} 45% 22%))`,
                }}
                aria-hidden
              >
                {a.name[0]}
              </span>

              <button
                onClick={() => link && copy(a.key, link)}
                disabled={!link}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <div className="truncate text-body text-ink">{a.name}</div>
                <div
                  className={
                    "text-[11px] " +
                    (isCopied ? "text-accentSoft" : "text-muted")
                  }
                >
                  {!parsed ? "waiting for a link" : isCopied ? "Copied ✓" : "Copy link"}
                </div>
              </button>

              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  title="Open"
                  className="shrink-0 rounded-full p-1.5 text-muted transition-colors hover:text-accentSoft"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 5h5v5M19 5l-8 8M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
                  </svg>
                </a>
              )}
              <button
                onClick={() => toggleFav(a.key)}
                title={isFav ? "Unstar" : "Set favourite"}
                className={
                  "shrink-0 rounded-full p-1.5 transition-colors " +
                  (isFav ? "text-accent" : "text-muted hover:text-ink")
                }
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill={isFav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.7l5.9-.9z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-meta text-muted">
        {AGENTS.length} agents. Missing one you use? Paste a real link from it and
        I&rsquo;ll add it.
      </p>
    </div>
  );
}
