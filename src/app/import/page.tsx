"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { buildBookmarklet } from "@/lib/import";

// Setup page for 1-click import. It hands you a bookmarklet to drag onto your
// bookmarks bar; clicking it on a listing (1688, Taobao, Weidian, Yupoo…) opens
// the add-item form prefilled with the title, link, a price guess, and the
// photos. It's a one-time install — the actual importing happens on the add page.

// Escape a string so it's safe inside a double-quoted HTML attribute.
function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function ImportSetupPage() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Derive the add-item URL from this page's own origin + base path, so the
    // bookmarklet points at wherever the app is actually served.
    const base = window.location.pathname.replace(/\/import\/?$/, "");
    const addItemUrl = `${window.location.origin}${base}/items/new/`;
    setCode(buildBookmarklet(addItemUrl));
  }, []);

  // Render the draggable button as raw HTML: a real <a href="javascript:…">.
  // React sanitises javascript: hrefs on normal elements, which leaves the
  // anchor with no URL and makes it undraggable — injecting the markup directly
  // keeps the href intact so drag-to-bookmarks works. onclick returns false so a
  // stray click on this page doesn't fire the bookmarklet here.
  const buttonHtml = code
    ? `<a href="${escapeAttr(code)}" onclick="return false;" draggable="true" ` +
      `class="inline-flex items-center gap-2 rounded-pill bg-accent px-4 py-2 ` +
      `text-meta font-medium text-white shadow-glow cursor-grab" ` +
      `title="Drag me to your bookmarks bar">` +
      `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ` +
      `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
      `stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>` +
      `Add to Catalog</a>`
    : "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is selectable in the box below */
    }
  }

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
            <span className="text-ink">Drag</span> this button up onto your
            bookmarks bar and let go:
          </p>
          <div className="mt-4 min-h-[40px]">
            {buttonHtml ? (
              <span dangerouslySetInnerHTML={{ __html: buttonHtml }} />
            ) : (
              <span className="text-meta text-muted">Preparing…</span>
            )}
          </div>
          <p className="mt-3 text-meta text-muted">
            (If your bookmarks bar is hidden, press{" "}
            <span className="text-ink">⌘⇧B</span> on Mac or{" "}
            <span className="text-ink">Ctrl+Shift+B</span> on Windows to show it.)
          </p>
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

        <details className="mt-4 rounded-card border border-line bg-surface2/40 p-5">
          <summary className="cursor-pointer text-meta uppercase tracking-[0.18em] text-muted">
            Drag not working? Add it by hand
          </summary>
          <p className="mt-3 text-meta text-muted">
            Right-click your bookmarks bar → <span className="text-ink">Add
            page…</span> (Firefox: <span className="text-ink">Add Bookmark…</span>
            ). Name it <span className="text-ink">Add to Catalog</span>, and paste
            this as the URL:
          </p>
          <div className="mt-3 flex items-start gap-2">
            <textarea
              readOnly
              value={code}
              onFocus={(e) => e.currentTarget.select()}
              rows={4}
              className="input flex-1 font-mono text-[11px] leading-snug"
            />
            <button
              type="button"
              onClick={copyCode}
              className="btn-accent shrink-0 px-3 py-2 text-meta"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </details>

        <section className="mt-4 rounded-card border border-line bg-surface2/40 p-5">
          <h2 className="text-meta uppercase tracking-[0.18em] text-muted">
            Good to know
          </h2>
          <ul className="mt-2 space-y-1.5 text-meta text-muted">
            <li>
              On 1688 it pulls the real title and the full-res photo gallery.
              Colours, MOQ and price you check yourself — it never saves anything
              without you.
            </li>
            <li>
              Photos are re-hosted into your own storage, so they won&apos;t rot
              if the listing disappears.
            </li>
            <li>
              Works best on desktop. On phones a bookmarklet is fiddly — paste the
              photos in by hand there for now.
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
