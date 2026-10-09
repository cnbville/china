"use client";

import { useEffect, useRef, useState } from "react";
import { SPACE_LABEL, useSpace, type Space } from "@/lib/space";

// The big Clothes ⇄ PC parts switch in the header. Flipping it swaps the whole
// catalog (items, collections, Later, Junk …) and the accent colour. Before
// migration 0015 is in, the PC side explains how to turn it on instead.

const ICON: Record<Space, React.ReactNode> = {
  clothes: <path d="M8.5 3 4 5.5l1.8 3.6L8 8.4V21h8V8.4l2.2.7L20 5.5 15.5 3c-.4 1.5-1.8 2.5-3.5 2.5S8.9 4.5 8.5 3Z" />,
  pc: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
};

function Glyph({ s, className = "h-4 w-4" }: { s: Space; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON[s]}
    </svg>
  );
}

export function SpaceToggle() {
  const { space, setSpace, ready } = useSpace();
  const [help, setHelp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!help) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setHelp(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [help]);

  function pick(s: Space) {
    if (s === space) return;
    if (s === "pc" && ready === false) {
      setHelp(true);
      return;
    }
    setSpace(s);
  }
  const other: Space = space === "clothes" ? "pc" : "clothes";

  return (
    <div ref={ref} className="relative">
      {/* Desktop: the full segmented switch with a sliding highlight. */}
      <div
        role="radiogroup"
        aria-label="Catalog side"
        className="relative hidden h-9 items-center rounded-pill border border-line bg-surface2/60 p-0.5 sm:flex"
      >
        <span
          aria-hidden
          className="absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-pill bg-accent shadow-glow transition-transform duration-300 ease-out"
          style={{ transform: space === "pc" ? "translateX(100%)" : "translateX(0)" }}
        />
        {(["clothes", "pc"] as Space[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={space === s}
            onClick={() => pick(s)}
            title={s === "pc" && ready === false ? "Turn on the PC side first" : `Switch to ${SPACE_LABEL[s]}`}
            className={
              "relative z-10 flex w-[104px] items-center justify-center gap-1.5 rounded-pill py-1.5 text-meta font-medium transition-colors " +
              (space === s ? "text-white" : "text-muted hover:text-ink")
            }
          >
            <Glyph s={s} />
            {SPACE_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Phone: one tap flips sides. */}
      <button
        type="button"
        onClick={() => pick(other)}
        title={`On ${SPACE_LABEL[space]} — tap for ${SPACE_LABEL[other]}`}
        className="flex h-8 items-center gap-1 rounded-pill border border-accent/50 bg-accent/15 px-2 text-accentSoft sm:hidden"
      >
        <Glyph s={space} />
        <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
        </svg>
      </button>

      {help && (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-card border border-line bg-card p-4 text-meta shadow-lift">
          <div className="font-medium text-ink">Turn on the PC side</div>
          <p className="mt-1 text-muted">
            One-time setup: in Supabase open <span className="text-ink">SQL Editor</span>, paste the
            file <span className="font-mono text-[12px] text-ink">0015_spaces.sql</span> and press{" "}
            <span className="text-ink">Run</span>. Then refresh this page.
          </p>
          <p className="mt-2 text-[12px] text-muted/80">Your clothes stay exactly where they are.</p>
        </div>
      )}
    </div>
  );
}
