"use client";

import { useEffect, useRef, useState } from "react";
import { AGENTS, AGENTS_SORTED, RAW_KEY } from "@/lib/links";
import { onOpenAgentPicker, useFavAgent } from "@/lib/favAgent";
import { AgentIcon, RawIcon } from "@/components/AgentIcon";


// Header pill: pick the agent every product link converts to. Same setting as
// the Link converter page, so changing it here changes it there too.
export function AgentMenu() {
  const [fav, setFav] = useFavAgent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const agent = AGENTS.find((a) => a.key === fav) ?? null;
  const raw = fav === RAW_KEY;

  // "Choose agent…" buttons elsewhere open this menu.
  useEffect(() => onOpenAgentPicker(() => setOpen(true)), []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(key: string | null) {
    setFav(key);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative max-sm:contents">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={agent ? `Links convert to ${agent.name}` : raw ? "Links come out as the raw original" : "Choose your agent"}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          // Hidden on phones: the header has no room. There the menu is opened
          // from "Choose agent…" on item pages (and /links has its own picker).
          "hidden items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta transition-colors sm:flex " +
          (open
            ? "border-accent/60 bg-accent/10 text-ink"
            : "border-line bg-surface2/60 text-muted hover:text-ink")
        }
      >
        {agent ? (
          <AgentIcon host={agent.hosts[0]} name={agent.name} size="sm" />
        ) : raw ? (
          <RawIcon size="sm" />
        ) : (
          <span className="grid h-5 w-5 place-items-center rounded-[5px] border border-line text-[11px]">
            ?
          </span>
        )}
        <span className="text-ink">{agent ? agent.name : raw ? "Raw link" : "Agent"}</span>
        <svg
          viewBox="0 0 24 24"
          className={
            "h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="fixed right-3 top-16 z-40 max-h-[70vh] w-64 overflow-y-auto rounded-card border border-line bg-card p-1.5 shadow-lift sm:absolute sm:right-0 sm:top-full sm:mt-2"
        >
          <div className="px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-muted">
            Convert links to
          </div>
          <MenuItem active={raw} onClick={() => pick(RAW_KEY)}>
            <RawIcon size="sm" />
            <span>
              Raw link
              <span className="block text-[10.5px] leading-tight text-muted/80">
                The original Taobao / Weidian / 1688 link
              </span>
            </span>
          </MenuItem>
          <div className="mx-2 my-1 border-t border-line/70" />
          {AGENTS_SORTED.map((a, i) => (
            <div key={a.key}>
              {!a.verified && AGENTS_SORTED[i - 1]?.verified && (
                <div className="mt-1 border-t border-line/70 px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.2em] text-muted">
                  Unconfirmed formats
                </div>
              )}
              <MenuItem active={a.key === fav} onClick={() => pick(a.key)}>
                <AgentIcon host={a.hosts[0]} name={a.name} size="sm" />
                <span className={a.verified ? "" : "text-muted"}>{a.name}</span>
                {!a.verified && (
                  <span
                    title="Link format not confirmed yet"
                    className="text-[10px] text-muted/70"
                  >
                    ?
                  </span>
                )}
              </MenuItem>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
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
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className={
        "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-meta transition-colors " +
        (active
          ? "bg-surface2 text-ink"
          : "text-muted hover:bg-surface2/60 hover:text-ink")
      }
    >
      {children}
      {active && <span className="ml-auto text-accentSoft">✓</span>}
    </button>
  );
}
