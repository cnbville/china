"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();

  async function onSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4">
        {/* Brand lockup */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative block h-8 w-8 overflow-hidden rounded-[8px] shadow-glow transition-transform group-hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/china/icons/icon-192.png"
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-serif text-xl tracking-tightish">
              Personal Catalog
            </span>
            <span className="mt-0.5 text-[10px] uppercase tracking-[0.28em] text-muted">
              Private
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          <IconLink href="/search" label="Search" active={pathname === "/search"}>
            <path d="M11 4a7 7 0 1 0 4.2 12.6L20 21m-1.5-10A7 7 0 1 1 11 4Z" />
          </IconLink>
          <IconLink
            href="/convert"
            label="Convert"
            active={pathname === "/convert"}
          >
            <path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0 3 3m-3-3-3 3" />
          </IconLink>

          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

          <Link
            href="/items/new"
            className="btn-accent flex items-center gap-1.5 px-3 py-2 text-meta"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">Add item</span>
          </Link>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            className="rounded-card p-2 text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <span className="sr-only">Sign out</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </nav>
      </div>

      {/* Faint red gradient underline for a bit of glow. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
    </header>
  );
}

function IconLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className={
        "rounded-card p-2 transition-colors hover:bg-surface2 " +
        (active ? "text-accentSoft" : "text-muted hover:text-ink")
      }
    >
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </Link>
  );
}
