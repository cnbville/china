"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Cross-cutting navigation between the main browse views. Makes every item
// reachable (nothing gets "lost"): the feed shows unfiled items, while All,
// Wanted, Liked and Collections cover everything else.
const TABS = [
  { href: "/", label: "Feed" },
  { href: "/all", label: "All" },
  { href: "/collections", label: "Collections" },
  { href: "/wanted", label: "Wanted" },
  { href: "/liked", label: "Liked" },
];

function norm(p: string) {
  return p !== "/" ? p.replace(/\/+$/, "") : "/";
}

export function CatalogNav() {
  const path = norm(usePathname());
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 text-meta">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "whitespace-nowrap rounded-pill border px-3 py-1.5 transition-colors " +
              (active
                ? "border-accent bg-accent/10 text-ink"
                : "border-line text-muted hover:border-ink/40 hover:text-ink")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
