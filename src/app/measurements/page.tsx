"use client";

import { AppShell } from "@/components/AppShell";
import { Measurements } from "@/components/Measurements";

// Measurements: body profile, fit references, and per-item measurements (all cm).
export default function MeasurementsPage() {
  return (
    <AppShell>
      <Measurements />
    </AppShell>
  );
}
