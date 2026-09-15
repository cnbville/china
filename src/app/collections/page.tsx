"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";
import { CollectionsList } from "@/components/CollectionsList";

function CollectionsInner() {
  const id = useSearchParams().get("id");
  // With ?id → that collection's items; without → the list of collections.
  return id ? (
    <ItemsView scope={{ kind: "collection", id }} />
  ) : (
    <CollectionsList />
  );
}

export default function CollectionsPage() {
  return (
    <>
      <Header />
      <Suspense>
        <CollectionsInner />
      </Suspense>
    </>
  );
}
