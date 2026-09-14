"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ItemView } from "@/components/ItemView";

// Item view, addressed by ?id=… (query params instead of a path segment so the
// page can be statically exported for GitHub Pages).
function ItemPageInner() {
  const id = useSearchParams().get("id");
  if (!id) return <p className="p-8 text-meta text-muted">No item selected.</p>;
  return <ItemView itemId={id} />;
}

export default function ItemPage() {
  return (
    <Suspense>
      <ItemPageInner />
    </Suspense>
  );
}
