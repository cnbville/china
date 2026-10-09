"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The big toggle: which side of the catalog you're on — clothes or PC parts.
// Everything that belongs to a side (items, collections, categories, Later,
// Junk, outfits, measurements) carries a `space` column (migration 0015) and
// every list / insert is scoped to the current side.
//
// Until migration 0015 has been run the column doesn't exist, so we check once
// and, if it's missing, behave exactly like before (no filtering, toggle shows
// "run the SQL"). That way deploying this code never breaks the live site.

export type Space = "clothes" | "pc";
export const SPACES: Space[] = ["clothes", "pc"];
export const SPACE_LABEL: Record<Space, string> = { clothes: "Clothes", pc: "PC parts" };

const KEY = "catalog-space";
const CHANGE = "catalog-space-change";

export function getSpace(): Space {
  try {
    return localStorage.getItem(KEY) === "pc" ? "pc" : "clothes";
  } catch {
    return "clothes";
  }
}

export function setSpace(s: Space) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.space = s;
  window.dispatchEvent(new CustomEvent(CHANGE));
}

// --- Is migration 0015 in place? (checked once per page load) ---------------
let readyPromise: Promise<boolean> | null = null;
let readyValue: boolean | null = null;

export function spacesReady(): Promise<boolean> {
  readyPromise ??= (async () => {
    const { error } = await createClient().from("items").select("space").limit(1);
    // 42703 = undefined_column → the SQL hasn't been run yet. Any other error
    // (offline, auth) isn't about the column, so don't hold the feature back.
    readyValue = !(error && (error.code === "42703" || /space/i.test(error.message)));
    return readyValue;
  })();
  return readyPromise;
}

/**
 * The side to scope queries to, or null when migration 0015 isn't in yet
 * (then: no filtering, no `space` on inserts — exactly the old behaviour).
 */
export async function activeSpace(): Promise<Space | null> {
  return (await spacesReady()) ? getSpace() : null;
}

/** Add `.eq("space", …)` to a query when sides are active. */
export function inSpace<Q>(q: Q, space: Space | null): Q {
  // Loosely typed on purpose: Supabase's builder types are too deep to
  // constrain generically, and every builder has .eq().
  return space ? (q as unknown as { eq: (c: string, v: string) => Q }).eq("space", space) : q;
}

/** Extra columns for an insert: `{ space }` when sides are active. */
export function spaceRow(space: Space | null): { space?: Space } {
  return space ? { space } : {};
}

/** Notes keys are per side: clothes keeps the old keys, PC gets a prefix. */
export function noteKey(key: string, space: Space | null): string {
  return space === "pc" ? `pc:${key}` : key;
}

/** Current side + setter, kept in sync across the app and other tabs. */
export function useSpace(): { space: Space; setSpace: (s: Space) => void; ready: boolean | null } {
  const [space, set] = useState<Space>("clothes");
  const [ready, setReady] = useState<boolean | null>(readyValue);
  useEffect(() => {
    const sync = () => set(getSpace());
    sync();
    spacesReady().then(setReady);
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { space, setSpace, ready };
}

/** Run `fn` whenever the side changes (e.g. to reload a page's data). */
export function onSpaceChange(fn: () => void): () => void {
  window.addEventListener(CHANGE, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(CHANGE, fn);
    window.removeEventListener("storage", fn);
  };
}

// --- Which side does a listing title belong to? ------------------------------
// Used when importing: if the title clearly reads like the other side, the add
// form asks before saving. Chinese + English keywords for PC parts.
const PC_WORDS = [
  "显卡", "主板", "内存", "固态", "硬盘", "电源", "机箱", "散热", "风扇", "处理器", "水冷", "cpu",
  "gpu", "rtx", "gtx", "radeon", "rx 7", "rx 6", "geforce", "ryzen", "intel", "i5-", "i7-", "i9-",
  "ddr4", "ddr5", "nvme", "m.2", "ssd", "hdd", "psu", "motherboard", "mainboard", "atx", "itx",
  "graphics card", "aio", "cooler", "pcie", "lga", "am4", "am5", "b650", "x670", "z790", "b760",
];
const CLOTHES_WORDS = [
  "衣", "裤", "外套", "夹克", "卫衣", "t恤", "衬衫", "毛衣", "鞋", "帽", "裙", "羽绒",
  "hoodie", "jacket", "shirt", "tee", "pants", "jeans", "shorts", "sweater", "coat", "sneaker",
  "trousers", "cargo", "cap", "beanie",
];

export function guessSpace(title: string | null | undefined): Space | null {
  const t = (title ?? "").toLowerCase();
  if (!t.trim()) return null;
  const score = (words: string[]) => words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  const pc = score(PC_WORDS);
  const clothes = score(CLOTHES_WORDS);
  if (pc > clothes) return "pc";
  if (clothes > pc) return "clothes";
  return null;
}
