"use client";

import { AppShell } from "@/components/AppShell";
import { ItemsView } from "@/components/ItemsView";

export default function AllPage() {
  return (
    <AppShell>
      <ItemsView scope={{ kind: "all" }} />
    </AppShell>
  );
}
