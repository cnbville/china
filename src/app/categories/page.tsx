"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CategoryBrowser } from "@/components/CategoryBrowser";

// Category view, addressed by ?id=… (and optional ?collection=…).
function CategoryPageInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const collection = params.get("collection") ?? undefined;
  if (!id)
    return <p className="p-8 text-meta text-muted">No category selected.</p>;
  return <CategoryBrowser categoryId={id} initialCollection={collection} />;
}

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryPageInner />
    </Suspense>
  );
}
