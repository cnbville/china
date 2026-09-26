"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { LinkConverter } from "@/components/LinkConverter";

// Dedicated link-converter tool page.
export default function LinksPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-4 py-8">
        <LinkConverter />
        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}
