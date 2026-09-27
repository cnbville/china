"use client";

import { useEffect, useState } from "react";
import { AGENTS } from "@/lib/links";

// "Your agent": the one agent every product link gets converted to. Stored in
// this browser (same key the Link converter has always used) and shared live
// between the header picker, the Link converter and item pages.

const FAV_KEY = "link-fav-agent";
const CHANGE = "fav-agent-change";
const OPEN_PICKER = "open-agent-picker";

export function getFavAgent(): string | null {
  try {
    const k = localStorage.getItem(FAV_KEY);
    return k && AGENTS.some((a) => a.key === k) ? k : null;
  } catch {
    return null;
  }
}

export function setFavAgent(key: string | null) {
  try {
    if (key) localStorage.setItem(FAV_KEY, key);
    else localStorage.removeItem(FAV_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHANGE));
}

/** The current agent key (null = direct links), kept in sync everywhere. */
export function useFavAgent(): [string | null, (key: string | null) => void] {
  const [fav, setFav] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setFav(getFavAgent());
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [fav, setFavAgent];
}

/** Ask the header's agent picker to open (e.g. from "Choose agent…"). */
export function openAgentPicker() {
  window.dispatchEvent(new CustomEvent(OPEN_PICKER));
}

export function onOpenAgentPicker(fn: () => void): () => void {
  window.addEventListener(OPEN_PICKER, fn);
  return () => window.removeEventListener(OPEN_PICKER, fn);
}
