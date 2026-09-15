"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";

function CategoryInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const collection = params.get("collection") ?? undefined;
  if (!id)
    return <p className="p-8 text-meta text-muted">No category selected.</p>;
  return <ItemsView scope={{ kind: "category", id, collection }} />;
}

export default function CategoryPage() {
  return (
    <>
      <Header />
      <Suspense>
        <CategoryInner />
      </Suspense>
    </>
  );
}
