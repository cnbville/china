"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
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
    <AppShell>
      <Suspense>
        <CollectionsInner />
      </Suspense>
    </AppShell>
  );
}
