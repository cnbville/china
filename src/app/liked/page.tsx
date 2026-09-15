"use client";

import { Header } from "@/components/Header";
import { ItemsView } from "@/components/ItemsView";

export default function LikedPage() {
  return (
    <>
      <Header />
      <ItemsView scope={{ kind: "liked" }} />
    </>
  );
}
