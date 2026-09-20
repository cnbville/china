"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OutfitsList } from "@/components/OutfitsList";
import { OutfitEditor } from "@/components/OutfitEditor";

// With ?id → the outfit editor (full width, three views). Without → the list of
// saved outfits inside the normal shell.
function OutfitsInner() {
  const id = useSearchParams().get("id");
  return id ? (
    <OutfitEditor outfitId={id} />
  ) : (
    <AppShell>
      <OutfitsList />
    </AppShell>
  );
}

export default function OutfitsPage() {
  return (
    <Suspense>
      <OutfitsInner />
    </Suspense>
  );
}
