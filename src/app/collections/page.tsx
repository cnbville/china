"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionCategories } from "@/components/CollectionCategories";

// Collection view (its categories), addressed by ?id=…
function CollectionPageInner() {
  const id = useSearchParams().get("id");
  if (!id)
    return <p className="p-8 text-meta text-muted">No collection selected.</p>;
  return <CollectionCategories collectionId={id} />;
}

export default function CollectionPage() {
  return (
    <Suspense>
      <CollectionPageInner />
    </Suspense>
  );
}
