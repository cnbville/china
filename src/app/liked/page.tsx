"use client";

import { AppShell } from "@/components/AppShell";
import { ItemsView } from "@/components/ItemsView";

export default function LikedPage() {
  return (
    <AppShell>
      <ItemsView scope={{ kind: "liked" }} />
    </AppShell>
  );
}
