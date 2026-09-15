"use client";

import { AppShell } from "@/components/AppShell";
import { ItemsView } from "@/components/ItemsView";

export default function WantedPage() {
  return (
    <AppShell>
      <ItemsView scope={{ kind: "wanted" }} />
    </AppShell>
  );
}
