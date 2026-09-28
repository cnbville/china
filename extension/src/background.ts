/// <reference types="chrome" />
// Background worker: the right-click menu, and "Add to catalog" (reads the
// product page's photos, then opens the website's prefilled add-item form).

import { BARE_HOSTS, buildAgentLink, marketplaceUrl, parseLink } from "../../src/lib/links";
import { extractPage } from "./extract";
import { agentOf, getSettings, importUrl, MP_LABEL, onSettings, type Settings } from "./shared";

const PATTERNS = BARE_HOSTS.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

function buildMenus(s: Settings) {
  chrome.contextMenus.removeAll(() => {
    const agent = agentOf(s.fav);
    type Ctx = NonNullable<chrome.contextMenus.CreateProperties["contexts"]>;
    const add = (id: string, title: string, where: "link" | "page") =>
      chrome.contextMenus.create({
        id,
        title,
        contexts: [where] as unknown as Ctx,
        ...(where === "link" ? { targetUrlPatterns: PATTERNS } : { documentUrlPatterns: PATTERNS }),
      });
    for (const where of ["link", "page"] as const) {
      const what = where === "link" ? "link" : "page";
      if (agent) {
        add(`${where}:open-agent`, `Open ${what} in ${agent.name}`, where);
        add(`${where}:copy-agent`, `Copy ${agent.name} link`, where);
      } else {
        add(`${where}:pick`, "Choose your agent… (click the extension icon)", where);
      }
      add(`${where}:copy-original`, "Copy original link", where);
      add(`${where}:open-original`, "Open original link", where);
      add(`${where}:catalog`, "Add to catalog", where);
    }
  });
}

chrome.runtime.onInstalled.addListener(() => getSettings().then(buildMenus));
chrome.runtime.onStartup.addListener(() => getSettings().then(buildMenus));
onSettings(buildMenus);

async function copyInTab(tabId: number | undefined, text: string, toast: string) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "pc-copy", text, toast });
  } catch {
    /* page without our content script (e.g. the web store) — nothing to do */
  }
}

async function addToCatalog(tab: chrome.tabs.Tab | undefined, linkUrl?: string) {
  const p = parseLink(linkUrl ?? tab?.url ?? "");
  let payload: { v: 1; title?: string; url?: string; price?: string; images?: string[] } = {
    v: 1,
    url: p ? marketplaceUrl(p.marketplace, p.id) : linkUrl ?? tab?.url,
  };
  // The product page itself: grab title / price / every photo.
  if (!linkUrl && tab?.id != null) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: extractPage,
      });
      if (res?.result) payload = { ...res.result, url: payload.url };
    } catch {
      /* restricted page — fall back to just the link */
    }
  }
  chrome.tabs.create({ url: importUrl(payload), index: (tab?.index ?? 0) + 1 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [where, action] = String(info.menuItemId).split(":");
  const raw = where === "link" ? info.linkUrl : info.pageUrl ?? tab?.url;
  const p = raw ? parseLink(raw) : null;
  const s = await getSettings();
  const agent = agentOf(s.fav);
  if (action === "pick") {
    chrome.action.openPopup?.().catch(() => {});
    return;
  }
  if (action === "catalog") return addToCatalog(tab, where === "link" ? info.linkUrl : undefined);
  if (!p) {
    copyInTab(tab?.id, "", "No product in that link");
    return;
  }
  const original = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const open = (url: string) => chrome.tabs.create({ url, index: (tab?.index ?? 0) + 1 });
  if (action === "open-agent" && agentLink) open(agentLink);
  if (action === "open-original") open(original);
  if (action === "copy-agent" && agentLink) copyInTab(tab?.id, agentLink, `Copied ${agent!.name} link`);
  if (action === "copy-original") copyInTab(tab?.id, original, `Copied original ${MP_LABEL[p.marketplace]} link`);
});

// From the page button / popup.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "pc-catalog") {
    const tabId: number | undefined = msg.tabId ?? sender.tab?.id;
    if (tabId != null) chrome.tabs.get(tabId).then((t) => addToCatalog(t));
    reply(true);
  }
});
