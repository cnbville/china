"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import { LinkHub } from "@/components/LinkHub";

// The Link hub: convert, check and keep any product link (or a whole list).
export default function LinksPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10">
        <LinkHub />
        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}
