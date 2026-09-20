"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { buildBookmarklet } from "@/lib/import";

// Setup page for 1-click import. It hands you a bookmarklet to drag onto your
// bookmarks bar; clicking it on a listing (1688, Taobao, Weidian, Yupoo…) opens
// the add-item form prefilled with the title, link, a price guess, and the
// photos. It's a one-time install — the actual importing happens on the add page.
export default function ImportSetupPage() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Derive the add-item URL from this page's own origin + base path, so the
    // bookmarklet points at wherever the app is actually served.
    const base = window.location.pathname.replace(/\/import\/?$/, "");
    const addItemUrl = `${window.location.origin}${base}/items/new/`;
    const code = buildBookmarklet(addItemUrl);
    // React strips javascript: hrefs on render, so set it on the DOM directly.
    if (linkRef.current) linkRef.current.setAttribute("href", code);
    setReady(true);
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="font-serif text-3xl">Quick import</h1>
        <p className="mt-2 text-body text-muted">
          Turn a listing into a draft item in one click — photos, link, and a
          price guess filled in for you. Set it up once.
        </p>

        <section className="mt-8 rounded-card border border-line bg-card p-5">
          <h2 className="text-meta uppercase tracking-[0.18em] text-muted">
            Step 1 — install
          </h2>
          <p className="mt-2 text-body">
            Drag this button up onto your bookmarks bar (or right-click it →{" "}
            <span className="text-ink">Bookmark this link</span>):
          </p>
          <div className="mt-4">
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex items-center gap-2 rounded-pill bg-accent px-4 py-2 text-meta font-medium text-white shadow-glow"
              title="Drag me to your bookmarks bar"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
              </svg>
              Add to Catalog
            </a>
          </div>
          {!ready && (
            <p className="mt-2 text-meta text-muted">Preparing…</p>
          )}
        </section>

        <section className="mt-4 rounded-card border border-line bg-card p-5">
          <h2 className="text-meta uppercase tracking-[0.18em] text-muted">
            Step 2 — use it
          </h2>
          <ol className="mt-2 space-y-2 text-body text-muted">
            <li>
              <span className="text-ink">1.</span> Open a product page on 1688,
              Taobao, Weidian or Yupoo.
            </li>
            <li>
              <span className="text-ink">2.</span> Click{" "}
              <span className="text-ink">Add to Catalog</span> in your bookmarks
              bar.
            </li>
            <li>
              <span className="text-ink">3.</span> A new tab opens with the
              add-item form prefilled. Fix anything, then{" "}
              <span className="text-ink">Save item</span>.
            </li>
          </ol>
        </section>

        <section className="mt-4 rounded-card border border-line bg-surface2/40 p-5">
          <h2 className="text-meta uppercase tracking-[0.18em] text-muted">
            Good to know
          </h2>
          <ul className="mt-2 space-y-1.5 text-meta text-muted">
            <li>
              It grabs the title, link, photos and a rough price. Colours, MOQ
              and the rest you add yourself — it never saves anything without you.
            </li>
            <li>
              Photos are re-hosted into your own storage, so they won&apos;t rot
              if the listing disappears.
            </li>
            <li>
              Works best on desktop. On phones a bookmarklet is fiddly — paste
              the photos in by hand there for now.
            </li>
          </ul>
        </section>

        <div className="mt-6">
          <Link href="/items/new" className="text-meta text-accent hover:underline">
            ← Back to add item
          </Link>
        </div>
      </main>
    </>
  );
}
