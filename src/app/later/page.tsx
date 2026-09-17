"use client";

import { AppShell } from "@/components/AppShell";
import { LaterLinks } from "@/components/LaterLinks";

// "Later" tab: a stash of factory links to review before cataloguing them.
export default function LaterPage() {
  return (
    <AppShell>
      <LaterLinks />
    </AppShell>
  );
}
