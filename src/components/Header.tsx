"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// App-wide header. Quiet and out of the way (plan section 6).
export function Header() {
  const router = useRouter();

  async function onSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="font-serif text-2xl leading-none tracking-tightish"
        >
          Sourcing Catalog
        </Link>

        <nav className="ml-auto flex items-center gap-4 text-meta">
          <Link href="/search" className="text-muted hover:text-ink">
            Search
          </Link>
          <Link
            href="/items/new"
            className="rounded-card bg-ink px-3 py-1.5 text-paper hover:opacity-90"
          >
            Add item
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="text-muted hover:text-ink"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
