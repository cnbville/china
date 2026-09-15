"use client";

import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";

export default function WantedPage() {
  return (
    <>
      <Header />
      <ItemsView scope={{ kind: "wanted" }} />
    </>
  );
}
