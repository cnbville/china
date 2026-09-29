"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import {
  AGENTS,
  AGENTS_SORTED,
  buildAgentLink,
  detectAgent,
  extractLinkEntries,
  marketplaceUrl,
  parseLink,
  RAW_KEY,
  twinMarketplace,
  type Marketplace,
  type ParsedLink,
} from "@/lib/links";
import { linkKey } from "@/lib/linkKey";
import { loadLinkIndex, type LinkHit } from "@/lib/linkIndex";
import { buildImportHash } from "@/lib/import";
import { useFavAgent } from "@/lib/favAgent";
import { AgentIcon, RawIcon } from "@/components/AgentIcon";

// The Link hub: the front door for any product link. Paste one link and it's
// converted for your agent, checked against everything you already have, and
// one click from your catalog / Later / Junk. Paste a wall of text and every
// link in it is pulled out and handled in bulk. It works both ways: a raw
// marketplace link converts to your agent, and an agent link (CSSBuy, CNFans …)
// converts back to the raw Taobao / Tmall / Weidian / 1688 link. All local.

const HISTORY_KEY = "link-history:v1";
const HISTORY_MAX = 12;

type Agent = (typeof AGENTS)[number];
type HistoryEntry = { marketplace: Marketplace; id: string; at: number; label?: string };
// `source` = the agent the pasted link came from (null for a raw marketplace link).
type Product = { raw: string; parsed: ParsedLink; key: string; label: string; source: string | null };

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

// Copying a rendered Reddit post (or any web page) puts hyperlinked words in
// the clipboard as plain text — the URLs only survive in its HTML copy. Rebuild
// that into "[words](url)" so every link comes through, labelled by its words.
function htmlToLinkText(html: string): string | null {
  if (!html || !/<a[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  if (!anchors.some((a) => parseLink(a.getAttribute("href") ?? ""))) return null;
  for (const a of anchors) {
    const href = a.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) continue;
    const words = (a.textContent ?? "").replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim();
    const md = words && words !== href ? `[${words}](${href})` : href;
    a.replaceWith(doc.createTextNode(` ${md} `));
  }
  doc.querySelectorAll("br").forEach((b) => b.replaceWith(doc.createTextNode("\n")));
  doc
    .querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre")
    .forEach((el) => el.append(doc.createTextNode("\n")));
  return (doc.body.textContent ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Links that are obviously not products (the post itself, image hosts, socials)
// are dropped quietly instead of cluttering "couldn't read these".
const NOT_PRODUCTS =
  /^https?:\/\/(?:[\w-]+\.)*(?:reddit\.com|redd\.it|imgur\.com|youtube\.com|youtu\.be|discord\.(?:com|gg)|twitter\.com|x\.com|instagram\.com|tiktok\.com|google\.com|pinterest\.com)(?:[\/?#]|$)/i;

export function LinkHub() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  // Your agent — shared with the header picker and item pages.
  const [fav, setFav] = useFavAgent();
  const [picking, setPicking] = useState(false);
  const [index, setIndex] = useState<Map<string, LinkHit>>(new Map());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  // Bulk output: agent links or the raw originals (null = pick automatically).
  const [bulkMode, setBulkMode] = useState<"agent" | "original" | null>(null);
  // Labels you've edited by hand, per product (win over the auto-detected ones).
  const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});

  // Restore favourite agent + recent history.
  useEffect(() => {
    try {
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
      const text =
        htmlToLinkText(e.clipboardData?.getData("text/html") ?? "") ??
        e.clipboardData?.getData("text") ??
        "";
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
  // "Raw link" picked like an agent: everything comes out as the original.
  const isRaw = fav === RAW_KEY;

  function chooseFav(key: string | null) {
    setFav(key);
    setPicking(false);
  }

  function pushHistory(p: ParsedLink, tag = "") {
    setHistory((h) => {
      const next = [
        { marketplace: p.marketplace, id: p.id, at: Date.now(), ...(tag ? { label: tag } : {}) },
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

  async function copyText(id: string, text: string, label: string, p?: ParsedLink, tag = "") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      flash("Clipboard blocked — select and copy manually");
      return;
    }
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    flash(label);
    if (p) pushHistory(p, tag);
  }

  // Your agent's link for a product (or the direct link if no agent is set).
  function outLink(p: ParsedLink): string {
    return (
      (favAgent && buildAgentLink(favAgent.key, p)) ||
      marketplaceUrl(p.marketplace, p.id)
    );
  }

  // Later keeps the label as its label (title); Junk only has a note.
  async function saveTo(table: "saved_links" | "junk_links", p: ParsedLink, tag = "") {
    const url = marketplaceUrl(p.marketplace, p.id);
    const k = keyOf(p);
    setBusy(`${table}:${k}`);
    const row: Record<string, string | null> =
      table === "saved_links" ? { url, title: tag || null } : { url, note: tag || null };
    const { error } = await createClient().from(table).insert(row);
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
    pushHistory(p, tag);
  }

  function addAsItem(p: ParsedLink, tag = "") {
    pushHistory(p, tag);
    const base = window.location.pathname.replace(/\/links\/?$/, "");
    const url = marketplaceUrl(p.marketplace, p.id);
    const hash = buildImportHash({ v: 1, url, ...(tag ? { title: tag } : {}) });
    window.location.assign(`${base}/items/new/${hash}`);
  }

  // --- What's in the bar? -------------------------------------------------
  const analysis = useMemo(() => {
    const text = input.trim();
    if (!text) return { kind: "empty" as const };
    const entries = extractLinkEntries(text);
    if (entries.length <= 1) {
      const raw = entries[0]?.url ?? text;
      return {
        kind: "single" as const,
        raw,
        parsed: parseLink(raw),
        source: detectAgent(raw),
        label: entries[0]?.label ?? "",
      };
    }
    const products: Product[] = [];
    const unknown: string[] = [];
    const byKey = new Map<string, Product>();
    for (const { url: raw, label } of entries) {
      const parsed = parseLink(raw);
      if (!parsed) {
        if (!NOT_PRODUCTS.test(raw)) unknown.push(raw);
        continue;
      }
      const key = keyOf(parsed);
      const seen = byKey.get(key);
      if (seen) {
        if (!seen.label && label) seen.label = label;
        continue;
      }
      const x = { raw, parsed, key, label, source: detectAgent(raw)?.name ?? null };
      byKey.set(key, x);
      products.push(x);
    }
    return { kind: "bulk" as const, products, unknown };
  }, [input]);

  const single = analysis.kind === "single" ? analysis : null;
  const singleLink = single?.parsed ? outLink(single.parsed) : null;
  // Reverse: an agent link in → the raw marketplace link is the main answer.
  const singleOriginal = single?.parsed
    ? marketplaceUrl(single.parsed.marketplace, single.parsed.id)
    : null;
  const singleReverse = !!single?.source || !favAgent;
  const singlePrimary = singleReverse ? singleOriginal : singleLink;
  const singleKey = single?.parsed ? keyOf(single.parsed) : null;
  const singleLabel = singleKey ? (labelEdits[singleKey] ?? single?.label ?? "") : "";
  const labelOf = (x: Product) => labelEdits[x.key] ?? x.label;
  const setLabel = (key: string, v: string) =>
    setLabelEdits((m) => ({ ...m, [key]: v }));

  // Pasting straight into the bar: rebuild HTML clipboards (see htmlToLinkText).
  function onBarPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const rebuilt = htmlToLinkText(e.clipboardData.getData("text/html"));
    if (!rebuilt) return;
    e.preventDefault();
    const el = e.currentTarget;
    setInput(el.value.slice(0, el.selectionStart) + rebuilt + el.value.slice(el.selectionEnd));
    setShowQR(false);
  }

  function onBarKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      setInput("");
      setShowQR(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && single?.parsed && singlePrimary) {
      e.preventDefault();
      copyText(
        "hero",
        singlePrimary,
        singleReverse || !favAgent
          ? `Copied original ${MP[single.parsed.marketplace].label} link`
          : `Copied ${favAgent.name} link`,
        single.parsed,
        singleLabel,
      );
    }
  }

  // Bulk helpers. Originals by default when every link came from an agent.
  const bulkOriginal =
    analysis.kind === "bulk" &&
    (!favAgent ||
      (bulkMode ??
        (analysis.products.length > 0 && analysis.products.every((x) => x.source)
          ? "original"
          : "agent")) === "original");
  const bulkOut = (x: Product) =>
    bulkOriginal ? marketplaceUrl(x.parsed.marketplace, x.parsed.id) : outLink(x.parsed);
  async function bulkCopy(products: Product[]) {
    await copyText(
      "bulk-copy",
      products.map(bulkOut).join("\n"),
      `Copied ${products.length} ${bulkOriginal ? "original links" : `links${favAgent ? ` for ${favAgent.name}` : ""}`}`,
    );
  }
  // "label — link" lines: for sharing a haul list or pasting into notes.
  async function bulkCopyList(products: Product[]) {
    await copyText(
      "bulk-list",
      products
        .map((x) => (labelOf(x) ? `${labelOf(x)} — ${bulkOut(x)}` : bulkOut(x)))
        .join("\n"),
      `Copied ${products.length} as a labelled list`,
    );
  }
  function bulkCsv(products: Product[]) {
    const head = ["label", "pasted", "from_agent", "marketplace", "id", "original_url", "agent", "agent_url", "status"];
    const rows = products.map((x) => {
      const hit = index.get(x.key);
      return [
        labelOf(x),
        x.raw,
        x.source ?? "",
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
      .insert(
        fresh.map((x) => ({
          url: marketplaceUrl(x.parsed.marketplace, x.parsed.id),
          title: labelOf(x) || null,
        })),
      );
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
    <span className="text-muted/70">Taobao · Weidian · 1688 · Tmall · any agent — both ways</span>
  );
  if (single?.parsed) {
    summary = (
      <span className="flex min-w-0 items-center gap-2">
        <MarketBadge mp={single.parsed.marketplace} />
        <span className="tnum truncate text-ink">#{single.parsed.id}</span>
        {single.source && <span className="shrink-0 text-muted">↩ from {single.source.name}</span>}
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
              raw={isRaw}
              onClick={() => setPicking((v) => !v)}
              open={picking}
            />
          </div>
          <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight text-sheen">
            Paste anything.
          </h1>
          <p className="mt-2 text-body text-muted">
            Raw link to your agent, or any agent link back to the raw one. Check
            it against your catalog, keep it — one link or a hundred.
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
            onPaste={onBarPaste}
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
            {single?.parsed && <span className="flex items-center gap-1"><Kbd>↵</Kbd> copy</span>}
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> clear</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {analysis.kind === "empty" && (
        <EmptyState
          history={history}
          onPick={(e) => {
            const url = marketplaceUrl(e.marketplace, e.id);
            setInput(e.label ? `${e.label} ${url}` : url);
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
          raw={isRaw}
          source={single.source}
          link={singleLink}
          hit={index.get(keyOf(single.parsed))}
          copied={copied}
          busy={busy}
          showQR={showQR}
          onToggleQR={() => setShowQR((v) => !v)}
          onPickAgent={() => setPicking(true)}
          label={singleLabel}
          onLabel={(v) => singleKey && setLabel(singleKey, v)}
          onCopy={(id, text, label) =>
            copyText(id, text, label, single.parsed ?? undefined, singleLabel)
          }
          onSave={(t) => single.parsed && saveTo(t, single.parsed, singleLabel)}
          onAdd={() => single.parsed && addAsItem(single.parsed, singleLabel)}
          onMakeFav={(k) => chooseFav(k)}
        />
      )}

      {analysis.kind === "bulk" && (
        <BulkResult
          products={analysis.products}
          unknown={analysis.unknown}
          agent={favAgent}
          raw={isRaw}
          index={index}
          copied={copied}
          busy={busy}
          labelOf={labelOf}
          onLabel={setLabel}
          original={bulkOriginal}
          onMode={(m) => setBulkMode(m)}
          onCopyOne={(x) =>
            copyText(
              `row:${x.key}`,
              bulkOut(x),
              `Copied ${labelOf(x) || `#${x.parsed.id}`}`,
              x.parsed,
              labelOf(x),
            )
          }
          onCopyAll={() => bulkCopy(analysis.products)}
          onCopyList={() => bulkCopyList(analysis.products)}
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

function AgentSwitch({ agent, raw, onClick, open }: { agent: Agent | null; raw: boolean; onClick: () => void; open: boolean }) {
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
      ) : raw ? (
        <>
          <RawIcon size="sm" />
          <span className="text-ink">Raw link</span>
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
      <button
        onClick={() => onPick(RAW_KEY)}
        className={
          "mt-3 flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors " +
          (current === RAW_KEY
            ? "border-accent/60 bg-accent/10"
            : "border-line/70 hover:border-line hover:bg-surface2/50")
        }
      >
        <RawIcon size="md" />
        <span className="min-w-0">
          <span className="block text-body text-ink">Raw link</span>
          <span className="block text-[11.5px] text-muted">
            No agent — always the original Taobao / Tmall / Weidian / 1688 link, even from a CSSBuy or CNFans link.
          </span>
        </span>
        {current === RAW_KEY && <span className="ml-auto text-accentSoft">✓</span>}
      </button>
      {[true, false].map((verified) => (
        <div key={String(verified)}>
          {!verified && (
            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
              <span className="uppercase tracking-[0.2em]">Unconfirmed formats</span>
              <span className="h-px flex-1 bg-line/70" />
            </div>
          )}
          {!verified && (
            <p className="mt-1 text-[11px] text-muted/80">
              Their link shape is a best guess — check the first link opens the right product.
            </p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {AGENTS_SORTED.filter((a) => a.verified === verified).map((a) => (
              <button
                key={a.key}
                onClick={() => onPick(a.key)}
                title={a.verified ? a.name : `${a.name} — link format not confirmed yet`}
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
      ))}
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
  raw,
  source,
  link,
  hit,
  copied,
  busy,
  showQR,
  onToggleQR,
  onPickAgent,
  label,
  onLabel,
  onCopy,
  onSave,
  onAdd,
  onMakeFav,
}: {
  p: ParsedLink;
  agent: Agent | null;
  raw: boolean;
  source: Agent | null;
  link: string | null;
  hit: LinkHit | undefined;
  copied: string | null;
  busy: string | null;
  showQR: boolean;
  onToggleQR: () => void;
  onPickAgent: () => void;
  label: string;
  onLabel: (v: string) => void;
  onCopy: (id: string, text: string, label: string) => void;
  onSave: (t: "saved_links" | "junk_links") => void;
  onAdd: () => void;
  onMakeFav: (k: string) => void;
}) {
  const direct = marketplaceUrl(p.marketplace, p.id);
  const k = keyOf(p);
  const others = AGENTS_SORTED.filter((a) => a.key !== agent?.key && a.key !== source?.key);
  const mpName = MP[p.marketplace].label;
  // Reverse: pasted an agent link (or no agent chosen) → the raw link leads.
  const reverse = !!source || !agent;
  const hero = reverse ? direct : link;
  const twin = twinMarketplace(p.marketplace);

  return (
    <div className="animate-rise">
      <div className="glass mt-4 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted">
              <span className="whitespace-nowrap">{reverse ? "Original link" : "Your agent"}</span>
              {source && (
                <span className="hidden truncate rounded-pill border border-line/80 bg-surface2/60 px-2 py-0.5 normal-case tracking-normal text-ink/80 sm:inline">
                  ↩ back from {source.name}
                </span>
              )}
            </span>
            <span className="shrink-0 whitespace-nowrap">
              <StatusPill hit={hit} />
            </span>
          </div>

          <div className="mt-3 flex items-start gap-3.5">
            {reverse ? (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] border border-line bg-surface2/70">
                <MarketBadgeDot mp={p.marketplace} />
              </span>
            ) : (
              agent && <AgentIcon host={agent.hosts[0]} name={agent.name} size="lg" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-lg font-medium leading-tight text-ink">
                {reverse ? `${mpName} · #${p.id}` : agent?.name}
              </div>
              <div className="mt-1 line-clamp-2 break-all font-mono text-[11.5px] leading-relaxed text-muted">
                {hero}
              </div>
              {!reverse && agent && !agent.verified && (
                <p className="mt-2 text-[11px] text-amber-300/90">
                  {agent.name}&rsquo;s link format isn&rsquo;t confirmed yet — if this opens the wrong
                  page, paste me a real {agent.name} link and I&rsquo;ll fix it.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {hero && (
              <button
                onClick={() =>
                  onCopy("hero", hero, reverse ? `Copied original ${mpName} link` : `Copied ${agent?.name} link`)
                }
                className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-body"
              >
                {copied === "hero" ? "Copied ✓" : reverse ? `Copy ${mpName} link` : "Copy link"}
                <kbd className="rounded-[5px] bg-white/20 px-1.5 py-px font-mono text-[10px] text-white">↵</kbd>
              </button>
            )}
            {hero && (
              <a href={hero} target="_blank" rel="noreferrer" className="btn-ghost inline-flex items-center gap-1.5 !py-2">
                Open ↗
              </a>
            )}
            {hero && (
              <button onClick={onToggleQR} className={"btn-ghost inline-flex items-center gap-1.5 !py-2 " + (showQR ? "!border-accent/60" : "")}>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
                </svg>
                QR
              </button>
            )}
            {reverse && twin && (
              <button
                onClick={() => onCopy("twin", marketplaceUrl(twin, p.id), `Copied ${MP[twin].label} link`)}
                className="ml-auto text-meta text-muted hover:text-ink"
                title="Taobao and Tmall share item numbers, and most agents don't say which one it was — both links open the same product."
              >
                {copied === "twin" ? "Copied ✓" : `As ${MP[twin].label} link`}
              </button>
            )}
          </div>

          {showQR && hero && <QrPanel text={hero} />}
        </div>

        {/* The other direction: your agent's link, or the clean original */}
        {!(reverse && !agent && raw) && (
        <div className="flex items-center gap-3 border-t border-line/60 px-5 py-3">
          {reverse ? (
            agent && link ? (
              <>
                <AgentIcon host={agent.hosts[0]} name={agent.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-meta text-ink">
                    Your agent · {agent.name}
                    {!agent.verified && <span className="ml-1.5 text-[11px] text-amber-300/90">format unconfirmed</span>}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-muted">{link}</div>
                </div>
                <button
                  onClick={() => onCopy("second", link, `Copied ${agent.name} link`)}
                  className="shrink-0 rounded-pill border border-line px-3 py-1 text-[11px] text-ink transition-colors hover:border-accent/50 hover:text-accentSoft"
                >
                  {copied === "second" ? "Copied ✓" : "Copy"}
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-meta text-muted">Want it for your agent too?</span>
                <button onClick={onPickAgent} className="text-meta text-accentSoft hover:underline">
                  Choose your agent →
                </button>
              </>
            )
          ) : (
            <>
              <MarketBadgeDot mp={p.marketplace} />
              <div className="min-w-0 flex-1">
                <div className="text-meta text-ink">Original {mpName} link</div>
                <div className="truncate font-mono text-[10.5px] text-muted">{direct}</div>
              </div>
              <button
                onClick={() => onCopy("second", direct, `Copied original ${mpName} link`)}
                className="shrink-0 rounded-pill border border-line px-3 py-1 text-[11px] text-ink transition-colors hover:border-accent/50 hover:text-accentSoft"
              >
                {copied === "second" ? "Copied ✓" : "Copy"}
              </button>
            </>
          )}
        </div>
        )}

        {/* Keep it */}
        <div className="border-t border-line/60 bg-surface2/25 px-5 py-3">
        <label className="mb-3 flex items-center gap-3">
          <span className="w-10 shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted">Label</span>
          <input
            value={label}
            onChange={(e) => onLabel(e.target.value)}
            placeholder="What is it? — saved with it to Later, or as the item's title"
            className="min-w-0 flex-1 border-b border-line/70 bg-transparent py-1 text-body text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-accent/60"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 w-10 text-[11px] uppercase tracking-[0.18em] text-muted">Keep</span>
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
        </div>
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
              className={
                "group flex items-center rounded-pill border bg-card/40 pl-1 pr-1 transition-colors hover:bg-card/80 " +
                (a.verified ? "border-line/80 hover:border-line" : "border-dashed border-line/70 hover:border-line")
              }
            >
              <button
                onClick={() => onCopy(id, l, `Copied ${a.name} link`)}
                className={"flex items-center gap-1.5 py-1 pl-0.5 pr-2 text-meta " + (a.verified ? "text-ink" : "text-muted")}
                title={a.verified ? `Copy ${a.name} link` : `Copy ${a.name} link — format not confirmed yet`}
              >
                <AgentIcon host={a.hosts[0]} name={a.name} size="sm" />
                {copied === id ? <span className="text-accentSoft">Copied ✓</span> : a.name}
                {!a.verified && copied !== id && <span className="text-[10px] text-muted/70">?</span>}
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
  raw,
  index,
  copied,
  busy,
  labelOf,
  onLabel,
  original,
  onMode,
  onCopyOne,
  onCopyAll,
  onCopyList,
  onCsv,
  onSaveNew,
  onPickAgent,
}: {
  products: Product[];
  unknown: string[];
  agent: Agent | null;
  raw: boolean;
  index: Map<string, LinkHit>;
  copied: string | null;
  busy: string | null;
  labelOf: (x: Product) => string;
  onLabel: (key: string, v: string) => void;
  original: boolean;
  onMode: (m: "agent" | "original") => void;
  onCopyOne: (x: Product) => void;
  onCopyAll: () => void;
  onCopyList: () => void;
  onCsv: () => void;
  onSaveNew: () => void;
  onPickAgent: () => void;
}) {
  const owned = products.filter((x) => index.has(x.key)).length;
  const fresh = products.length - owned;
  const labelled = products.filter((x) => labelOf(x)).length;

  return (
    <div className="animate-rise mt-4">
      {/* Summary + bulk actions */}
      <div className="glass p-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <Stat n={products.length} label="products" />
          <Stat n={fresh} label="new to you" />
          <Stat n={owned} label="already yours" />
          <Stat n={labelled} label="labelled" />
          {unknown.length > 0 && <Stat n={unknown.length} label="unrecognised" dim />}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Output</span>
          <div className="inline-flex rounded-pill border border-line/80 bg-surface2/50 p-0.5 text-meta">
            {agent && (
              <button
                onClick={() => onMode("agent")}
                className={"rounded-pill px-3 py-1 transition-colors " + (!original ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {agent.name} links
              </button>
            )}
            <button
              onClick={() => onMode("original")}
              className={"rounded-pill px-3 py-1 transition-colors " + (original || !agent ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}
              title="The raw Taobao / Tmall / Weidian / 1688 link — converted back from whatever agent it came from"
            >
              Originals
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={onCopyAll} disabled={!products.length} className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-body disabled:opacity-50">
            {copied === "bulk-copy"
              ? "Copied ✓"
              : `Copy all ${products.length} · ${original || !agent ? "originals" : agent.name}`}
          </button>
          <button onClick={onSaveNew} disabled={!fresh || busy === "bulk-later"} className="btn-ghost !py-2 disabled:opacity-50">
            Save {fresh} new to Later
          </button>
          <button onClick={onCopyList} disabled={!products.length} className="btn-ghost !py-2 disabled:opacity-50" title="Each line: label — link">
            {copied === "bulk-list" ? "Copied ✓" : "Copy as list"}
          </button>
          <button onClick={onCsv} disabled={!products.length} className="btn-ghost !py-2 disabled:opacity-50">
            Export CSV
          </button>
          {!agent && !raw && (
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
                <div className="min-w-0 flex-1">
                  <input
                    value={labelOf(x)}
                    onChange={(e) => onLabel(x.key, e.target.value)}
                    placeholder="Add a label…"
                    aria-label={`Label for #${x.parsed.id}`}
                    className="-mx-1 w-full rounded-[6px] bg-transparent px-1 py-0.5 text-body text-ink outline-none transition-colors placeholder:text-muted/45 hover:bg-surface2/40 focus:bg-surface2/70"
                  />
                  <div className="truncate font-mono text-[10.5px] text-muted">
                    #{x.parsed.id}
                    {x.source && <span className="font-sans"> · ↩ from {x.source}</span>}
                  </div>
                </div>
                <span className="shrink-0">
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
              <span className="min-w-0 truncate text-body text-ink">{e.label || <span className="font-mono text-[12px]">#{e.id}</span>}</span>
              {e.label && <span className="shrink-0 font-mono text-[11px] text-muted">#{e.id}</span>}
              <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(e.at)}</span>
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
