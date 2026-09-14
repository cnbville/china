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
    <header className="sticky top-0 z-20 border-b border-line bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="group flex items-center gap-2 leading-none tracking-tightish"
        >
          <span className="h-4 w-1.5 rounded-pill bg-accent shadow-glow" />
          <span className="font-serif text-2xl">Sourcing Catalog</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-meta sm:gap-3">
          <Link
            href="/search"
            className="rounded-card px-2 py-1.5 text-muted transition-colors hover:text-ink"
          >
            Search
          </Link>
          <Link href="/items/new" className="btn-accent px-3 py-1.5 text-meta">
            + Add item
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-card px-2 py-1.5 text-muted transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
