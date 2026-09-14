"use client";

import Link from "next/link";
import type { ItemCard } from "@/lib/types";

// The rolled-up summary comes from an item's sources (plan section 5):
//   from ¥27 · 3 links · 14 colors  — price is the TOP-RANKED source's price
//   (lead_price from the view), not the minimum. Rendered by <Summary> below.

function formatPrice(n: number): string {
  // Whole yuan when even, otherwise up to 2 decimals — no trailing ".00".
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function ItemGrid({
  items,
  thumbs,
  view,
}: {
  items: ItemCard[];
  thumbs: Record<string, string>;
  view: "grid" | "list";
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
              <div className="ml-auto flex gap-1.5">
                {item.liked && <Dot label="liked" />}
                {item.wanted && <Dot label="wanted" filled />}
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
            {/* subtle bottom fade for legibility + status dots */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute right-2 top-2 flex gap-1">
              {item.liked && <Dot label="liked" />}
              {item.wanted && <Dot label="wanted" filled />}
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
    </div>
  );
}

function Dot({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={
        "inline-block h-2 w-2 rounded-full ring-2 ring-black/40 " +
        (filled ? "bg-accent shadow-glow" : "bg-ink/70")
      }
    />
  );
}
