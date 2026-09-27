"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { LinkConverter } from "@/components/LinkConverter";

// Dedicated link-converter tool page.
export default function LinksPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10">
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
