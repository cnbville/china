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
// you want. All local, no network. Encrypted/shortened links can't be resolved
// here yet.
const FAV_KEY = "link-fav-agent";

const MP: Record<Marketplace, { label: string; hue: number }> = {
  taobao: { label: "Taobao", hue: 28 },
  tmall: { label: "Tmall", hue: 348 },
  weidian: { label: "Weidian", hue: 12 },
  "1688": { label: "1688", hue: 36 },
};

// Real brand favicon on a clean neutral chip, with a quiet monogram fallback —
// far more premium than tinted gradient tiles.
function AgentIcon({
  host,
  name,
  copied,
}: {
  host: string;
  name: string;
  copied?: boolean;
}) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className={
        "relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[9px] border border-white/10 bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] " +
        (copied ? "animate-pop" : "")
      }
    >
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          className="h-5 w-5 object-contain"
          onError={() => setOk(false)}
          loading="lazy"
        />
      ) : (
        <span className="font-sans text-sm font-semibold text-paper">
          {name[0]}
        </span>
      )}
    </span>
  );
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
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
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
      {/* Hero */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[38rem] max-w-[120%] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 40%, rgba(255,46,67,0.18), transparent 70%)",
          }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-pill border border-line/80 bg-card/50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
            Tools · Converter
          </span>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-sheen">
            Link converter
          </h1>
          <p className="mt-3 max-w-prose text-body text-muted">
            Drop any Taobao, Weidian, Tmall or 1688 link — direct or from another
            agent — and lift it into whichever agent you buy through. Star your
            go-to to keep it first.
          </p>
        </div>
      </div>

      {/* Paste field */}
      <label
        className={
          "glass card-lift mt-8 flex items-start gap-3 p-4 transition-all " +
          (input.trim()
            ? parsed
              ? "border-accent/40"
              : ""
            : "")
        }
        style={
          parsed
            ? { boxShadow: "0 0 0 1px rgba(255,46,67,0.25), 0 14px 40px rgba(255,46,67,0.12)" }
            : undefined
        }
      >
        <span
          className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-line bg-surface2/70 text-accentSoft"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 15l6-6M10.8 6.7l1.6-1.6a3.2 3.2 0 0 1 4.5 4.5l-1.6 1.6M13.2 17.3l-1.6 1.6a3.2 3.2 0 0 1-4.5-4.5l1.6-1.6" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a product or agent link…"
            rows={2}
            autoFocus
            className="w-full resize-none bg-transparent font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted/50"
          />
        </div>
        {input && (
          <button
            onClick={(e) => {
              e.preventDefault();
              setInput("");
            }}
            className="mt-0.5 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-ink"
            title="Clear"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </label>

      {/* Detected + direct link */}
      {parsed && directUrl ? (
        <div className="animate-rise mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-glow"
            style={{
              background: `linear-gradient(135deg, hsl(${MP[parsed.marketplace].hue} 78% 48%), hsl(${MP[parsed.marketplace].hue} 78% 40%))`,
            }}
          >
            {MP[parsed.marketplace].label}
          </span>
          <span className="tnum text-meta text-ink">#{parsed.id}</span>
          {sourceAgent && (
            <span className="text-meta text-muted">from {sourceAgent.name}</span>
          )}
          <button
            onClick={() => copy("__direct__", directUrl)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface2/60 px-3 py-1 text-meta text-ink transition-colors hover:border-accent/50 hover:text-accentSoft"
          >
            {copied === "__direct__" ? "Copied ✓" : "Copy direct link"}
          </button>
        </div>
      ) : looksEncrypted ? (
        <div className="animate-rise mt-3 rounded-card border border-accent/40 bg-accent/5 px-4 py-3 text-meta text-accentSoft">
          That looks like a shortened/encrypted link — those need a server to
          unwrap (coming). Open it once and paste the real product URL.
        </div>
      ) : input.trim() ? (
        <p className="mt-3 text-meta text-muted">
          Couldn&rsquo;t read a product from that — check it&rsquo;s a full
          product link.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          Works with
          {(["taobao", "weidian", "1688", "tmall"] as Marketplace[]).map((m) => (
            <span
              key={m}
              className="rounded-pill border border-line bg-card/50 px-2 py-0.5"
            >
              {MP[m].label}
            </span>
          ))}
          + any agent link
        </div>
      )}

      {/* Section label */}
      <div className="mt-8 flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
          Convert to
        </span>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] text-muted tnum">{AGENTS.length} agents</span>
      </div>

      {/* Agent grid */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ordered.map((a, i) => {
          const link = parsed ? buildAgentLink(a.key, parsed) : null;
          const isFav = fav === a.key;
          const isCopied = copied === a.key;
          return (
            <div
              key={a.key}
              className={
                "hairline card-lift group relative flex items-center gap-3 overflow-hidden rounded-card border bg-card/40 px-3 py-2.5 " +
                (isFav ? "border-accent/50" : "border-line/70 hover:border-line") +
                (parsed ? "" : " opacity-80")
              }
              data-on={isFav ? "true" : undefined}
              style={{ animation: `rise .4s cubic-bezier(.22,1,.36,1) both`, animationDelay: `${Math.min(i, 8) * 22}ms` }}
            >
              {isFav && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-accent to-accentSoft"
                />
              )}
              <AgentIcon host={a.hosts[0]} name={a.name} copied={isCopied} />

              <button
                onClick={() => link && copy(a.key, link)}
                disabled={!link}
                className="relative min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-body font-medium text-ink">
                    {a.name}
                  </span>
                  {isFav && (
                    <span className="rounded-pill bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accentSoft">
                      Yours
                    </span>
                  )}
                </div>
                <div
                  className={
                    "mt-0.5 truncate text-[11px] " +
                    (isCopied ? "text-accentSoft" : "text-muted")
                  }
                >
                  {!parsed
                    ? a.hosts[0]
                    : isCopied
                      ? "Copied to clipboard ✓"
                      : "Tap to copy link"}
                </div>
              </button>

              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  title="Open"
                  className="relative shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-accentSoft"
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
                  "relative shrink-0 rounded-full p-1.5 transition-all " +
                  (isFav
                    ? "text-accent hover:text-accentSoft"
                    : "text-muted opacity-0 hover:text-ink group-hover:opacity-100")
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

      <p className="mt-5 text-center text-[11px] text-muted">
        Local &amp; instant · nothing leaves your device. Missing an agent? Paste
        a real link from it and I&rsquo;ll add it.
      </p>
    </div>
  );
}
