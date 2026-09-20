"use client";

import { AppShell } from "@/components/AppShell";
import { JunkLinks } from "@/components/JunkLinks";

// "Junk" drawer: a bare scratch list of link + note, separate from Later.
export default function JunkPage() {
  return (
    <AppShell>
      <JunkLinks />
    </AppShell>
  );
}
