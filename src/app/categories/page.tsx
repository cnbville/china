"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ItemsView } from "@/components/ItemsView";

function CategoryInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const collection = params.get("collection") ?? undefined;
  if (!id)
    return <p className="text-meta text-muted">No category selected.</p>;
  return <ItemsView scope={{ kind: "category", id, collection }} />;
}

export default function CategoryPage() {
  return (
    <AppShell>
      <Suspense>
        <CategoryInner />
      </Suspense>
    </AppShell>
  );
}
