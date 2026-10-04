/// <reference types="chrome" />
// Background worker: the right-click menu, and "Add to catalog" (reads the
// product page's photos, then opens the website's prefilled add-item form).

import { BARE_HOSTS, buildAgentLink, marketplaceUrl, parseLink } from "../../src/lib/links";
import { extractPage } from "./extract";
import { doppelQueries, doppelSearchUrl } from "../../src/lib/doppel";
import { agentOf, getSettings, importUrl, MP_LABEL, onSettings, type Settings } from "./shared";

const PATTERNS = BARE_HOSTS.flatMap((h) => [`*://${h}/*`, `*://*.${h}/*`]);

// Right-click a product link (on any site): one short list, grouped —
//   Open in <agent> · Copy <agent> link | Open raw link · Copy raw link | Add to catalog
// On a product page itself the floating bar does the same, so the menu stays
// link-only (no doubled-up page + link entries).
function buildMenus(s: Settings) {
  chrome.contextMenus.removeAll(() => {
    const agent = agentOf(s.fav);
    type Ctx = NonNullable<chrome.contextMenus.CreateProperties["contexts"]>;
    const base = { contexts: ["link"] as unknown as Ctx, targetUrlPatterns: PATTERNS };
    let sep = 0;
    const add = (id: string, title: string) => chrome.contextMenus.create({ ...base, id, title });
    const line = () => chrome.contextMenus.create({ ...base, id: `sep${sep++}`, type: "separator" });
    if (agent) {
      add("open-agent", `Open in ${agent.name}`);
      add("copy-agent", `Copy ${agent.name} link`);
      line();
    }
    add("open-original", "Open raw link");
    add("copy-original", "Copy raw link");
    line();
    add("doppel", "Search on doppel.fit");
    add("catalog", "Add to catalog");
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
  const action = String(info.menuItemId);
  const raw = info.linkUrl;
  if (action === "catalog") return addToCatalog(tab, raw);
  const p = raw ? parseLink(raw) : null;
  if (!p) {
    copyInTab(tab?.id, "", "No product in that link");
    return;
  }
  const agent = agentOf((await getSettings()).fav);
  const original = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const open = (url: string) => chrome.tabs.create({ url, index: (tab?.index ?? 0) + 1 });
  if (action === "open-agent" && agentLink) open(agentLink);
  if (action === "open-original") open(original);
  if (action === "doppel") open(doppelSearchUrl(doppelQueries(p, info.selectionText || null), `${MP_LABEL[p.marketplace]} #${p.id}`));
  if (action === "copy-agent" && agentLink) copyInTab(tab?.id, agentLink, `Copied ${agent!.name} link`);
  if (action === "copy-original") copyInTab(tab?.id, original, `Copied raw ${MP_LABEL[p.marketplace]} link`);
});

// From the page button / popup.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "pc-catalog") {
    const tabId: number | undefined = msg.tabId ?? sender.tab?.id;
    if (tabId != null) chrome.tabs.get(tabId).then((t) => addToCatalog(t));
    reply(true);
  }
});
