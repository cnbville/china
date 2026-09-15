"use client";

import Link from "next/link";
import type { ItemCard } from "@/lib/types";
import { PriceHint } from "@/components/PriceHint";

// The rolled-up summary comes from an item's sources (plan section 5):
//   from ¥27 · 3 links · 14 colors  — price is the TOP-RANKED source's price
//   (lead_price from the view), not the minimum. Rendered by <Summary> below.

function formatPrice(n: number): string {
  // Whole yuan when even, otherwise up to 2 decimals — no trailing ".00".
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export type ToggleField = "liked" | "wanted";

export function ItemGrid({
  items,
  thumbs,
  view,
  onToggle,
}: {
  items: ItemCard[];
  thumbs: Record<string, string>;
  view: "grid" | "list";
  // When provided, cards show interactive Like/Want toggles.
  onToggle?: (item: ItemCard, field: ToggleField, next: boolean) => void;
}) {
  if (items.length === 0) {
    return <p className="mt-6 text-meta text-muted">Nothing here.</p>;
  }

  if (view === "list") {
    return (
      <ul className="mt-6 space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/items?id=${item.id}`}
              className="group flex items-center gap-4 rounded-card border border-line bg-card/50 p-2 pr-4 transition-colors hover:border-accent/50 hover:bg-card"
            >
              <div className="h-16 w-[3.2rem] shrink-0 overflow-hidden rounded-[6px] bg-[#05060a]">
                {item.thumb_path && thumbs[item.thumb_path] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[item.thumb_path]}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body">{item.title}</div>
                <Summary item={item} />
              </div>
              <div className="ml-auto">
                <QuickToggles item={item} onToggle={onToggle} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/items?id=${item.id}`}
          className="group overflow-hidden rounded-card border border-line bg-card transition-all duration-300 hover:border-accent/50 hover:shadow-lift"
        >
          <div className="photo-frame">
            {item.thumb_path && thumbs[item.thumb_path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[item.thumb_path]} alt={item.title} />
            ) : (
              <div className="flex h-full items-center justify-center text-meta text-muted">
                no photo
              </div>
            )}
            {/* subtle bottom fade for legibility */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute right-2 top-2">
              <QuickToggles item={item} onToggle={onToggle} />
            </div>
          </div>
          <div className="p-3">
            <div className="truncate text-body">{item.title}</div>
            <Summary item={item} />
          </div>
        </Link>
      ))}
    </div>
  );
}

// The rolled-up summary with the lead price emphasised in the accent colour.
function Summary({ item }: { item: ItemCard }) {
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-meta text-muted tnum">
      {item.lead_price != null ? (
        <span className="text-ink">
          <span className="text-muted">from </span>
          <span className="font-medium text-accentSoft">
            ¥{formatPrice(item.lead_price)}
          </span>
        </span>
      ) : (
        <span>no price</span>
      )}
      <span className="text-line">·</span>
      <span>
        {item.source_count} {item.source_count === 1 ? "link" : "links"}
      </span>
      <span className="text-line">·</span>
      <span>
        {item.color_count} {item.color_count === 1 ? "color" : "colors"}
      </span>
      {item.lead_price != null && (
        <PriceHint cny={item.lead_price} className="w-full text-[11px]" />
      )}
    </div>
  );
}

// Like / Want quick toggles. Interactive when `onToggle` is given; otherwise
// read-only status pips (e.g. on the search results list).
function QuickToggles({
  item,
  onToggle,
}: {
  item: ItemCard;
  onToggle?: (item: ItemCard, field: ToggleField, next: boolean) => void;
}) {
  if (!onToggle) {
    return (
      <div className="flex gap-1.5">
        {item.liked && <Pip />}
        {item.wanted && <Pip filled />}
      </div>
    );
  }
  return (
    <div className="flex gap-1">
      <ToggleBtn
        active={item.liked}
        label="Like"
        onClick={() => onToggle(item, "liked", !item.liked)}
      >
        <path d="M12 21s-7.5-4.6-10-9.3C.6 8.8 2 5.5 5 5.5c1.9 0 3.2 1.1 4 2.3.8-1.2 2.1-2.3 4-2.3 3 0 4.4 3.3 3 6.2C19.5 16.4 12 21 12 21Z" />
      </ToggleBtn>
      <ToggleBtn
        active={item.wanted}
        label="Want"
        accent
        onClick={() => onToggle(item, "wanted", !item.wanted)}
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
      </ToggleBtn>
    </div>
  );
}

function ToggleBtn({
  active,
  label,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  accent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeColor = accent ? "text-accent" : "text-ink";
  return (
    <button
      type="button"
      title={active ? `${label}d` : label}
      onClick={(e) => {
        // Don't navigate the card link.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={
        "rounded-full border border-white/10 bg-black/45 p-1.5 backdrop-blur transition-colors hover:bg-black/60 " +
        (active ? activeColor : "text-white/60 hover:text-white")
      }
    >
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

function Pip({ filled }: { filled?: boolean }) {
  return (
    <span
      className={
        "inline-block h-2 w-2 rounded-full ring-2 ring-black/40 " +
        (filled ? "bg-accent shadow-glow" : "bg-ink/70")
      }
    />
  );
}
