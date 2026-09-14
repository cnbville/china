"use client";

import Link from "next/link";
import type { ItemCard } from "@/lib/types";

// The rolled-up summary line from an item's sources (plan section 5):
//   from ¥27 · 3 links · 14 colors
// Price is the TOP-RANKED source's price (lead_price from the view), not the min.
function summaryLine(item: ItemCard): string {
  const parts: string[] = [];
  parts.push(
    item.lead_price != null ? `from ¥${formatPrice(item.lead_price)}` : "no price",
  );
  parts.push(`${item.source_count} ${item.source_count === 1 ? "link" : "links"}`);
  parts.push(
    `${item.color_count} ${item.color_count === 1 ? "color" : "colors"}`,
  );
  return parts.join(" · ");
}

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
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/items/${item.id}`}
              className="flex items-center gap-4 py-3 hover:bg-card"
            >
              <div className="h-16 w-[3.2rem] shrink-0 overflow-hidden rounded-card bg-line">
                {item.thumb_path && thumbs[item.thumb_path] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[item.thumb_path]}
                    alt={item.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-body">{item.title}</div>
                <div className="text-meta text-muted tnum">
                  {summaryLine(item)}
                </div>
              </div>
              <div className="ml-auto flex gap-1">
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
    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/items/${item.id}`}
          className="group rounded-card border border-line bg-card hover:border-ink"
        >
          <div className="photo-frame rounded-t-card">
            {item.thumb_path && thumbs[item.thumb_path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[item.thumb_path]} alt={item.title} />
            ) : (
              <div className="flex h-full items-center justify-center text-meta text-muted">
                no photo
              </div>
            )}
          </div>
          <div className="p-3">
            <div className="truncate text-body">{item.title}</div>
            <div className="mt-0.5 text-meta text-muted tnum">
              {summaryLine(item)}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function Dot({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={
        "inline-block h-2 w-2 rounded-full " +
        (filled ? "bg-accent" : "border border-muted")
      }
    />
  );
}
