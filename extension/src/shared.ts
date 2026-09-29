/// <reference types="chrome" />
// Settings shared by the popup, the page button and the background worker.
// Stored in chrome.storage.sync so they follow you between Opera GX installs.

import { AGENTS, RAW_KEY, type AgentDef } from "../../src/lib/links";

export const APP_URL = "https://cnbville.github.io/china";

export type Settings = {
  fav: string | null; // your agent (same keys as the website; "raw" = original link)
  pill: boolean; // floating button on product pages
  rewrite: boolean; // point product links on other sites at your agent
};

export const DEFAULTS: Settings = { fav: null, pill: true, rewrite: false };

export async function getSettings(): Promise<Settings> {
  const s = (await chrome.storage.sync.get(DEFAULTS)) as Settings;
  if (s.fav && s.fav !== RAW_KEY && !AGENTS.some((a) => a.key === s.fav)) s.fav = null;
  return s;
}

export function setSettings(patch: Partial<Settings>): Promise<void> {
  return chrome.storage.sync.set(patch);
}

export function onSettings(fn: (s: Settings) => void) {
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === "sync") getSettings().then(fn);
  });
}

export function agentOf(key: string | null): AgentDef | null {
  return AGENTS.find((a) => a.key === key) ?? null;
}

/** "Raw link" chosen as your agent. */
export const isRaw = (key: string | null) => key === RAW_KEY;

export const MP_LABEL = { taobao: "Taobao", tmall: "Tmall", weidian: "Weidian", "1688": "1688" } as const;

/** The website's add-item page, prefilled via the same #import= hand-off the bookmarklet uses. */
export function importUrl(payload: object): string {
  return `${APP_URL}/items/new/#import=` + encodeURIComponent(JSON.stringify(payload));
}

export function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}
