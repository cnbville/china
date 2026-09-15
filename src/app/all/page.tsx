"use client";

import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";

export default function AllPage() {
  return (
    <>
      <Header />
      <ItemsView scope={{ kind: "all" }} />
    </>
  );
}
