"use client";

import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";

// The main feed = pieces NOT filed in any collection. Filed items live under
// their collection (see /collections); everything is reachable via the tabs.
export default function FeedPage() {
  return (
    <>
      <Header />
      <ItemsView scope={{ kind: "unfiled" }} />
    </>
  );
}
