"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  AGENTS,
  buildAgentLink,
  detectAgent,
  extractLinks,
  marketplaceUrl,
  parseLink,
  type Marketplace,
  type ParsedLink,
} from "@/lib/links";
import { linkKey } from "@/lib/linkKey";
import { loadLinkIndex, type LinkHit } from "@/lib/linkIndex";
import { buildImportHash } from "@/lib/import";

// The Link hub: the front door for any product link. Paste one link and it's
// converted for your agent, checked against everything you already have, and
// one click from your catalog / Later / Junk. Paste a wall of text and every
// link in it is pulled out and handled in bulk. All conversion is local.

const FAV_KEY = "link-fav-agent";
const HISTORY_KEY = "link-history:v1";
const HISTORY_MAX = 12;

type Agent = (typeof AGENTS)[number];
type HistoryEntry = { marketplace: Marketplace; id: string; at: number };
type Product = { raw: string; parsed: ParsedLink; key: string };

const MP: Record<Marketplace, { label: string; hue: number }> = {
  taobao: { label: "Taobao", hue: 24 },
  tmall: { label: "Tmall", hue: 350 },
  weidian: { label: "Weidian", hue: 8 },
  "1688": { label: "1688", hue: 32 },
};

const keyOf = (p: ParsedLink) => linkKey(marketplaceUrl(p.marketplace, p.id));

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function LinkHub() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [fav, setFav] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [index, setIndex] = useState<Map<string, LinkHit>>(new Map());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  // Restore favourite agent + recent history.
  useEffect(() => {
    try {
      const f = localStorage.getItem(FAV_KEY);
      if (f && AGENTS.some((a) => a.key === f)) setFav(f);
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      if (Array.isArray(h)) setHistory(h.slice(0, HISTORY_MAX));
    } catch {
      /* ignore */
    }
  }, []);

  // Everything you already have, for the "you've got this" checks.
  useEffect(() => {
    loadLinkIndex(createClient()).then(setIndex).catch(() => {});
  }, []);

  // Paste anywhere on the page · "/" focuses the bar.
  useEffect(() => {
    const isField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    };
    function onPaste(e: ClipboardEvent) {
      if (isField(e.target)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      setInput(text);
      setShowQR(false);
      inputRef.current?.focus();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !isField(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 1800);
  }, []);

  const favAgent: Agent | null = AGENTS.find((a) => a.key === fav) ?? null;

  function chooseFav(key: string | null) {
    setFav(key);
    setPicking(false);
    try {
      if (key) localStorage.setItem(FAV_KEY, key);
      else localStorage.removeItem(FAV_KEY);
    } catch {
      /* ignore */
    }
  }

  function pushHistory(p: ParsedLink) {
    setHistory((h) => {
      const next = [
        { marketplace: p.marketplace, id: p.id, at: Date.now() },
        ...h.filter((x) => !(x.marketplace === p.marketplace && x.id === p.id)),
      ].slice(0, HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function clearHistory() {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }

  async function copyText(id: string, text: string, label: string, p?: ParsedLink) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      flash("Clipboard blocked — select and copy manually");
      return;
    }
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    flash(label);
    if (p) pushHistory(p);
  }

  // Your agent's link for a product (or the direct link if no agent is set).
  function outLink(p: ParsedLink): string {
    return (
      (favAgent && buildAgentLink(favAgent.key, p)) ||
      marketplaceUrl(p.marketplace, p.id)
    );
  }

  async function saveTo(table: "saved_links" | "junk_links", p: ParsedLink) {
    const url = marketplaceUrl(p.marketplace, p.id);
    const k = keyOf(p);
    setBusy(`${table}:${k}`);
    const { error } = await createClient().from(table).insert({ url });
    setBusy(null);
    if (error) {
      flash(error.message);
      return;
    }
    setIndex((prev) => {
      const n = new Map(prev);
      if (!n.has(k)) n.set(k, { where: table === "saved_links" ? "later" : "junk" });
      return n;
    });
    flash(table === "saved_links" ? "Saved to Later" : "Tossed in Junk");
    pushHistory(p);
  }

  function addAsItem(p: ParsedLink) {
    pushHistory(p);
    const base = window.location.pathname.replace(/\/links\/?$/, "");
    const url = marketplaceUrl(p.marketplace, p.id);
    window.location.assign(`${base}/items/new/${buildImportHash({ v: 1, url })}`);
  }

  // --- What's in the bar? -------------------------------------------------
  const analysis = useMemo(() => {
    const text = input.trim();
    if (!text) return { kind: "empty" as const };
    const links = extractLinks(text);
    if (links.length <= 1) {
      const raw = links[0] ?? text;
      return {
        kind: "single" as const,
        raw,
        parsed: parseLink(raw),
        source: detectAgent(raw),
      };
    }
    const products: Product[] = [];
    const unknown: string[] = [];
    const seen = new Set<string>();
    for (const raw of links) {
      const parsed = parseLink(raw);
      if (!parsed) {
        unknown.push(raw);
        continue;
      }
      const key = keyOf(parsed);
      if (seen.has(key)) continue;
      seen.add(key);
      products.push({ raw, parsed, key });
    }
    return { kind: "bulk" as const, products, unknown };
  }, [input]);

  const single = analysis.kind === "single" ? analysis : null;
  const singleLink = single?.parsed ? outLink(single.parsed) : null;

  function onBarKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setInput("");
      setShowQR(false);
      return;
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      single?.parsed &&
      singleLink &&
      favAgent
    ) {
      e.preventDefault();
      copyText("hero", singleLink, `Copied ${favAgent.name} link`, single.parsed);
    }
  }

  // Bulk helpers
  async function bulkCopy(products: Product[]) {
    await copyText(
      "bulk-copy",
      products.map((x) => outLink(x.parsed)).join("\n"),
      `Copied ${products.length} links${favAgent ? ` for ${favAgent.name}` : ""}`,
    );
  }
  function bulkCsv(products: Product[]) {
    const head = ["original", "marketplace", "id", "direct_url", "agent", "agent_url", "status"];
    const rows = products.map((x) => {
      const hit = index.get(x.key);
      return [
        x.raw,
        x.parsed.marketplace,
        x.parsed.id,
        marketplaceUrl(x.parsed.marketplace, x.parsed.id),
        favAgent?.name ?? "",
        favAgent ? (buildAgentLink(favAgent.key, x.parsed) ?? "") : "",
        hit ? hit.where : "new",
      ];
    });
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `links-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(`Exported ${products.length} rows`);
  }
  async function bulkSaveNew(products: Product[]) {
    const fresh = products.filter((x) => !index.has(x.key));
    if (!fresh.length) return;
    setBusy("bulk-later");
    const { error } = await createClient()
      .from("saved_links")
      .insert(fresh.map((x) => ({ url: marketplaceUrl(x.parsed.marketplace, x.parsed.id) })));
    setBusy(null);
    if (error) {
      flash(error.message);
      return;
    }
    setIndex((prev) => {
      const n = new Map(prev);
      for (const x of fresh) if (!n.has(x.key)) n.set(x.key, { where: "later" });
      return n;
    });
    flash(`Saved ${fresh.length} to Later`);
  }

  // --- Summary line under the bar -----------------------------------------
  let summary: React.ReactNode = (
    <span className="text-muted/70">Taobao · Weidian · 1688 · Tmall · any agent</span>
  );
  if (single?.parsed) {
    summary = (
      <span className="flex min-w-0 items-center gap-2">
        <MarketBadge mp={single.parsed.marketplace} />
        <span className="tnum truncate text-ink">#{single.parsed.id}</span>
        {single.source && <span className="shrink-0 text-muted">from {single.source.name}</span>}
      </span>
    );
  } else if (single) {
    summary = <span className="text-muted">No product found in that</span>;
  } else if (analysis.kind === "bulk") {
    summary = (
      <span className="text-ink">
        {analysis.products.length} products
        {analysis.unknown.length > 0 && (
          <span className="text-muted"> · {analysis.unknown.length} unrecognised</span>
        )}
      </span>
    );
  }

  const barRows =
    analysis.kind === "bulk" ? Math.min(8, Math.max(3, input.split("\n").length)) : 2;

  return (
    <div className="relative">
      {/* Hero */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 40%, rgba(255,46,67,0.16), transparent 70%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-pill border border-line/80 bg-card/50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
              Link hub
            </span>
            <AgentSwitch
              agent={favAgent}
              onClick={() => setPicking((v) => !v)}
              open={picking}
            />
          </div>
          <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight text-sheen">
            Paste anything.
          </h1>
          <p className="mt-2 text-body text-muted">
            Convert it, check it against your catalog, keep it — one link or a
            hundred.
          </p>
        </div>
      </div>

      {picking && (
        <div className="animate-rise mt-4">
          <AgentPicker current={fav} onPick={chooseFav} />
        </div>
      )}

      {/* Command bar */}
      <div
        className="glass mt-6 transition-shadow"
        style={
          single?.parsed || analysis.kind === "bulk"
            ? { boxShadow: "0 0 0 1px rgba(255,46,67,0.28), 0 18px 44px rgba(255,46,67,0.10)" }
            : undefined
        }
      >
        <div className="flex items-start gap-3 p-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface2/70 text-accentSoft" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 15l6-6M10.8 6.7l1.6-1.6a3.2 3.2 0 0 1 4.5 4.5l-1.6 1.6M13.2 17.3l-1.6 1.6a3.2 3.2 0 0 1-4.5-4.5l1.6-1.6" />
            </svg>
          </span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowQR(false);
            }}
            onKeyDown={onBarKey}
            placeholder="Paste a link — or a whole list of them…"
            rows={barRows}
            autoFocus
            spellCheck={false}
            className="min-w-0 flex-1 resize-none bg-transparent pt-1.5 font-mono text-[12.5px] leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-muted/60"
          />
          {input && (
            <button
              onClick={() => {
                setInput("");
                setShowQR(false);
                inputRef.current?.focus();
              }}
              className="mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-ink"
              title="Clear (Esc)"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line/60 px-4 py-2.5 text-meta">
          <div className="min-w-0">{summary}</div>
          <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted sm:flex">
            <span className="flex items-center gap-1"><Kbd>⌘V</Kbd> anywhere</span>
            {favAgent && <span className="flex items-center gap-1"><Kbd>↵</Kbd> copy</span>}
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> clear</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {analysis.kind === "empty" && (
        <EmptyState
          history={history}
          onPick={(e) => {
            setInput(marketplaceUrl(e.marketplace, e.id));
            inputRef.current?.focus();
          }}
          onClear={clearHistory}
        />
      )}

      {single && !single.parsed && <NotFound raw={single.raw} />}

      {single?.parsed && (
        <SingleResult
          p={single.parsed}
          agent={favAgent}
          link={singleLink}
          hit={index.get(keyOf(single.parsed))}
          copied={copied}
          busy={busy}
          showQR={showQR}
          onToggleQR={() => setShowQR((v) => !v)}
          onPickAgent={() => setPicking(true)}
          onCopy={(id, text, label) => copyText(id, text, label, single.parsed ?? undefined)}
          onSave={(t) => single.parsed && saveTo(t, single.parsed)}
          onAdd={() => single.parsed && addAsItem(single.parsed)}
          onMakeFav={(k) => chooseFav(k)}
        />
      )}

      {analysis.kind === "bulk" && (
        <BulkResult
          products={analysis.products}
          unknown={analysis.unknown}
          agent={favAgent}
          index={index}
          copied={copied}
          busy={busy}
          outLink={outLink}
          onCopyOne={(x) =>
            copyText(`row:${x.key}`, outLink(x.parsed), `Copied #${x.parsed.id}`, x.parsed)
          }
          onCopyAll={() => bulkCopy(analysis.products)}
          onCsv={() => bulkCsv(analysis.products)}
          onSaveNew={() => bulkSaveNew(analysis.products)}
          onPickAgent={() => setPicking(true)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="glass animate-rise flex items-center gap-2 rounded-pill px-4 py-2 text-meta text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Pieces -----------------------------------------------------------------

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line bg-surface2/80 px-1.5 py-px font-mono text-[10px] text-muted">
      {children}
    </kbd>
  );
}

function MarketBadge({ mp }: { mp: Marketplace }) {
  const { label, hue } = MP[mp];
  return (
    <span
      className="shrink-0 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{
        color: `hsl(${hue} 95% 72%)`,
        background: `hsl(${hue} 80% 50% / 0.12)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 80% 55% / 0.35)`,
      }}
    >
      {label}
    </span>
  );
}

function AgentIcon({ host, name, size = "md" }: { host: string; name: string; size?: "sm" | "md" | "lg" }) {
  const [ok, setOk] = useState(true);
  const box = size === "lg" ? "h-12 w-12 rounded-[12px]" : size === "sm" ? "h-5 w-5 rounded-[5px]" : "h-8 w-8 rounded-[8px]";
  const img = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden border border-white/10 bg-white ${box}`}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          className={`${img} object-contain`}
          onError={() => setOk(false)}
          loading="lazy"
        />
      ) : (
        <span
          className={
            "font-semibold text-paper " +
            (size === "lg" ? "text-xl" : size === "sm" ? "text-[10px]" : "text-sm")
          }
        >
          {name[0]}
        </span>
      )}
    </span>
  );
}

function AgentSwitch({ agent, onClick, open }: { agent: Agent | null; onClick: () => void; open: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex shrink-0 items-center gap-2 rounded-pill border px-2.5 py-1.5 text-meta transition-colors " +
        (open ? "border-accent/60 bg-accent/10 text-ink" : "border-line bg-card/50 text-muted hover:border-line hover:text-ink")
      }
      title="Your agent"
    >
      {agent ? (
        <>
          <AgentIcon host={agent.hosts[0]} name={agent.name} size="sm" />
          <span className="text-ink">{agent.name}</span>
        </>
      ) : (
        <span>Choose your agent</span>
      )}
      <svg viewBox="0 0 24 24" className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function AgentPicker({ current, onPick }: { current: string | null; onPick: (k: string) => void }) {
  return (
    <div className="glass p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted">Which agent do you buy through?</div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {[...AGENTS].sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
          <button
            key={a.key}
            onClick={() => onPick(a.key)}
            className={
              "flex items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left text-meta transition-colors " +
              (current === a.key
                ? "border-accent/60 bg-accent/10 text-ink"
                : "border-transparent text-muted hover:border-line hover:bg-surface2/50 hover:text-ink")
            }
          >
            <AgentIcon host={a.hosts[0]} name={a.name} size="sm" />
            <span className="truncate">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ hit }: { hit: LinkHit | undefined }) {
  if (!hit) {
    return (
      <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] text-muted">New to you</span>
    );
  }
  if (hit.where === "item") {
    return hit.itemId ? (
      <Link
        href={`/items?id=${hit.itemId}`}
        className="inline-flex max-w-[16rem] items-center gap-1 rounded-pill bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-400/30 hover:bg-emerald-400/15"
      >
        <span className="truncate">In catalog{hit.title ? ` · ${hit.title}` : ""}</span> ↗
      </Link>
    ) : (
      <span className="rounded-pill bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-400/30">In catalog</span>
    );
  }
  return (
    <span className="rounded-pill bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-300 ring-1 ring-inset ring-sky-400/30">
      In {hit.where === "later" ? "Later" : "Junk"}
    </span>
  );
}

function QrPanel({ text }: { text: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, {
      margin: 1,
      width: 360,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0b0eff", light: "#ffffffff" },
    })
      .then((u) => live && setSrc(u))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <div className="animate-rise mt-4 flex items-center gap-4 rounded-card border border-line/70 bg-surface2/40 p-4">
      <div className="grid h-[132px] w-[132px] shrink-0 place-items-center rounded-[10px] bg-white p-2">
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="QR code" className="h-full w-full" />
        )}
      </div>
      <div className="text-meta text-muted">
        <div className="text-body text-ink">Scan to open on your phone</div>
        <p className="mt-1">Point your camera at it — the link opens straight in your agent&rsquo;s app or site.</p>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  done,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  done?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-meta transition-colors disabled:cursor-default " +
        (done
          ? "border-line/60 text-muted"
          : "border-line bg-card/40 text-ink hover:border-accent/50 hover:text-accentSoft disabled:opacity-50")
      }
    >
      {children}
    </button>
  );
}

function SingleResult({
  p,
  agent,
  link,
  hit,
  copied,
  busy,
  showQR,
  onToggleQR,
  onPickAgent,
  onCopy,
  onSave,
  onAdd,
  onMakeFav,
}: {
  p: ParsedLink;
  agent: Agent | null;
  link: string | null;
  hit: LinkHit | undefined;
  copied: string | null;
  busy: string | null;
  showQR: boolean;
  onToggleQR: () => void;
  onPickAgent: () => void;
  onCopy: (id: string, text: string, label: string) => void;
  onSave: (t: "saved_links" | "junk_links") => void;
  onAdd: () => void;
  onMakeFav: (k: string) => void;
}) {
  const direct = marketplaceUrl(p.marketplace, p.id);
  const k = keyOf(p);
  const others = AGENTS.filter((a) => a.key !== agent?.key).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="animate-rise">
      <div className="glass mt-4 overflow-hidden">
        {/* Your agent */}
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
              {agent ? "Your agent" : "Direct link"}
            </span>
            <StatusPill hit={hit} />
          </div>

          <div className="mt-3 flex items-start gap-3.5">
            {agent ? (
              <AgentIcon host={agent.hosts[0]} name={agent.name} size="lg" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-surface2/70">
                <MarketBadgeDot mp={p.marketplace} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-lg font-medium leading-tight text-ink">
                {agent ? agent.name : MP[p.marketplace].label}
              </div>
              <div className="mt-1 line-clamp-2 break-all font-mono text-[11.5px] leading-relaxed text-muted">
                {link}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {link && (
              <button
                onClick={() => onCopy("hero", link, agent ? `Copied ${agent.name} link` : "Copied direct link")}
                className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-body"
              >
                {copied === "hero" ? "Copied ✓" : "Copy link"}
                {agent && (
                  <kbd className="rounded-[5px] bg-white/20 px-1.5 py-px font-mono text-[10px] text-white">↵</kbd>
                )}
              </button>
            )}
            {link && (
              <a href={link} target="_blank" rel="noreferrer" className="btn-ghost inline-flex items-center gap-1.5 !py-2">
                Open ↗
              </a>
            )}
            {link && (
              <button onClick={onToggleQR} className={"btn-ghost inline-flex items-center gap-1.5 !py-2 " + (showQR ? "!border-accent/60" : "")}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
                </svg>
                QR
              </button>
            )}
            {!agent && (
              <button onClick={onPickAgent} className="ml-auto text-meta text-accentSoft hover:underline">
                Choose your agent →
              </button>
            )}
          </div>

          {showQR && link && <QrPanel text={link} />}
        </div>

        {/* Keep it */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-surface2/25 px-5 py-3">
          <span className="mr-1 text-[11px] uppercase tracking-[0.18em] text-muted">Keep</span>
          {hit?.where === "item" ? (
            <ActionButton onClick={() => {}} disabled done>✓ Already in catalog</ActionButton>
          ) : (
            <ActionButton onClick={onAdd}>＋ Add as item</ActionButton>
          )}
          <ActionButton
            onClick={() => onSave("saved_links")}
            disabled={!!hit || busy === `saved_links:${k}`}
            done={hit?.where === "later"}
          >
            {hit?.where === "later" ? "✓ In Later" : "Save to Later"}
          </ActionButton>
          <ActionButton
            onClick={() => onSave("junk_links")}
            disabled={!!hit || busy === `junk_links:${k}`}
            done={hit?.where === "junk"}
          >
            {hit?.where === "junk" ? "✓ In Junk" : "Junk it"}
          </ActionButton>
          <button
            onClick={() => onCopy("direct", direct, `Copied direct ${MP[p.marketplace].label} link`)}
            className="ml-auto text-meta text-muted hover:text-ink"
          >
            {copied === "direct" ? "Copied ✓" : `Direct ${MP[p.marketplace].label} link`}
          </button>
        </div>
      </div>

      {/* Every other agent */}
      <div className="mt-6 flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Also on</span>
        <span className="h-px flex-1 bg-line/70" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {others.map((a) => {
          const l = buildAgentLink(a.key, p);
          if (!l) return null;
          const id = `agent:${a.key}`;
          return (
            <div
              key={a.key}
              className="group flex items-center rounded-pill border border-line/80 bg-card/40 pl-1 pr-1 transition-colors hover:border-line hover:bg-card/80"
            >
              <button
                onClick={() => onCopy(id, l, `Copied ${a.name} link`)}
                className="flex items-center gap-1.5 py-1 pl-0.5 pr-2 text-meta text-ink"
                title={`Copy ${a.name} link`}
              >
                <AgentIcon host={a.hosts[0]} name={a.name} size="sm" />
                {copied === id ? <span className="text-accentSoft">Copied ✓</span> : a.name}
              </button>
              <button
                onClick={() => onMakeFav(a.key)}
                title={`Make ${a.name} your agent`}
                className="hidden rounded-full p-1 text-muted hover:text-accent group-hover:block"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.7l5.9-.9z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketBadgeDot({ mp }: { mp: Marketplace }) {
  return (
    <span
      className="h-3 w-3 rounded-full"
      style={{ background: `hsl(${MP[mp].hue} 85% 55%)`, boxShadow: `0 0 12px hsl(${MP[mp].hue} 85% 55% / 0.6)` }}
    />
  );
}

function BulkResult({
  products,
  unknown,
  agent,
  index,
  copied,
  busy,
  outLink,
  onCopyOne,
  onCopyAll,
  onCsv,
  onSaveNew,
  onPickAgent,
}: {
  products: Product[];
  unknown: string[];
  agent: Agent | null;
  index: Map<string, LinkHit>;
  copied: string | null;
  busy: string | null;
  outLink: (p: ParsedLink) => string;
  onCopyOne: (x: Product) => void;
  onCopyAll: () => void;
  onCsv: () => void;
  onSaveNew: () => void;
  onPickAgent: () => void;
}) {
  const owned = products.filter((x) => index.has(x.key)).length;
  const fresh = products.length - owned;

  return (
    <div className="animate-rise mt-4">
      {/* Summary + bulk actions */}
      <div className="glass p-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat n={products.length} label="products" />
          <Stat n={fresh} label="new to you" />
          <Stat n={owned} label="already yours" />
          {unknown.length > 0 && <Stat n={unknown.length} label="unrecognised" dim />}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={onCopyAll} disabled={!products.length} className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-body disabled:opacity-50">
            {copied === "bulk-copy" ? "Copied ✓" : `Copy all ${products.length}${agent ? ` · ${agent.name}` : " · direct"}`}
          </button>
          <button onClick={onSaveNew} disabled={!fresh || busy === "bulk-later"} className="btn-ghost !py-2 disabled:opacity-50">
            Save {fresh} new to Later
          </button>
          <button onClick={onCsv} disabled={!products.length} className="btn-ghost !py-2 disabled:opacity-50">
            Export CSV
          </button>
          {!agent && (
            <button onClick={onPickAgent} className="ml-auto text-meta text-accentSoft hover:underline">
              Choose your agent →
            </button>
          )}
        </div>
      </div>

      {/* Rows */}
      {products.length > 0 && (
        <div className="glass mt-3 divide-y divide-line/60 overflow-hidden">
          {products.map((x, i) => {
            const id = `row:${x.key}`;
            return (
              <div
                key={x.key}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface2/40"
                style={{ animation: "rise .35s cubic-bezier(.22,1,.36,1) both", animationDelay: `${Math.min(i, 12) * 18}ms` }}
              >
                <span className="w-6 shrink-0 text-right text-[11px] tnum text-muted/70">{i + 1}</span>
                <MarketBadge mp={x.parsed.marketplace} />
                <span className="w-32 shrink-0 truncate font-mono text-[12px] text-ink">#{x.parsed.id}</span>
                <span className="hidden min-w-0 flex-1 truncate font-mono text-[11px] text-muted md:block">
                  {outLink(x.parsed)}
                </span>
                <span className="ml-auto shrink-0 md:ml-0">
                  <StatusPill hit={index.get(x.key)} />
                </span>
                <button
                  onClick={() => onCopyOne(x)}
                  className="shrink-0 rounded-pill border border-line px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-accent/50 hover:text-accentSoft"
                >
                  {copied === id ? "✓" : "Copy"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {unknown.length > 0 && (
        <div className="mt-3 rounded-card border border-line/70 bg-card/30 p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Couldn&rsquo;t read these</div>
          <p className="mt-1 text-meta text-muted">
            Usually shortened/encrypted links (need a server to unwrap) or an agent that isn&rsquo;t added yet.
          </p>
          <ul className="mt-2 space-y-1">
            {unknown.map((u) => (
              <li key={u} className="truncate font-mono text-[11px] text-muted/80">{u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, dim }: { n: number; label: string; dim?: boolean }) {
  return (
    <span className={dim ? "text-muted" : "text-ink"}>
      <span className="font-serif text-3xl tnum">{n}</span>
      <span className="ml-1.5 text-meta text-muted">{label}</span>
    </span>
  );
}

function NotFound({ raw }: { raw: string }) {
  const encrypted = /m\.tb\.cn|(^|\.)tb\.cn|page\.link|\.cc\/|(^|\/\/)sl\.|short/i.test(raw);
  return (
    <div className="animate-rise mt-4 rounded-card border border-line/70 bg-card/30 p-5">
      <div className="text-body text-ink">
        {encrypted ? "That's a shortened / encrypted link" : "No product in that"}
      </div>
      <p className="mt-1 text-meta text-muted">
        {encrypted
          ? "These hide the real product behind a redirect that only a server can follow — that unwrapper is next on the list. For now, open it once and paste the real product URL."
          : "Paste a Taobao, Weidian, 1688 or Tmall product link — or any agent's link to one."}
      </p>
    </div>
  );
}

function EmptyState({
  history,
  onPick,
  onClear,
}: {
  history: HistoryEntry[];
  onPick: (e: HistoryEntry) => void;
  onClear: () => void;
}) {
  if (history.length > 0) {
    return (
      <div className="animate-rise mt-8">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted">Recent</span>
          <span className="h-px flex-1 bg-line/70" />
          <button onClick={onClear} className="text-[11px] text-muted hover:text-ink">Clear</button>
        </div>
        <div className="glass mt-3 divide-y divide-line/60 overflow-hidden">
          {history.map((e) => (
            <button
              key={`${e.marketplace}:${e.id}`}
              onClick={() => onPick(e)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface2/40"
            >
              <MarketBadge mp={e.marketplace} />
              <span className="font-mono text-[12px] text-ink">#{e.id}</span>
              <span className="ml-auto text-[11px] text-muted">{timeAgo(e.at)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const features = [
    { t: "Convert", d: "Any agent's link into yours, instantly — or into all of them." },
    { t: "Check", d: "See straight away if it's already in your catalog, Later or Junk." },
    { t: "Batch", d: "Paste a whole Reddit post or sheet column — every link, handled." },
  ];
  return (
    <div className="animate-rise mt-8 grid gap-3 sm:grid-cols-3">
      {features.map((f, i) => (
        <div key={f.t} className="rounded-card border border-line/60 bg-card/30 p-4">
          <div className="font-serif text-2xl text-ink/90">
            <span className="mr-2 text-[11px] font-sans tnum text-muted">0{i + 1}</span>
            {f.t}
          </div>
          <p className="mt-1.5 text-meta text-muted">{f.d}</p>
        </div>
      ))}
    </div>
  );
}
