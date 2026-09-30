/// <reference types="chrome" />
// Toolbar popup: a pocket Link hub. Paste (or open it on a product page) and
// get the same card as the on-page panel — raw link and your agent, both ways,
// every other agent folded away. Lists of links get bulk copy. Settings live
// behind the gear.

import { buildAgentLink, detectAgent, extractLinks, marketplaceUrl, parseLink, type ParsedLink } from "../../src/lib/links";
import { agentOf, APP_URL, getSettings, isRaw, MP_LABEL, setSettings, type Settings } from "./shared";
import { CARD_CSS, h, productCard } from "./ui";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("input");
const out = $<HTMLDivElement>("out");
const summary = $<HTMLDivElement>("summary");
let settings: Settings;
let tab: chrome.tabs.Tab | undefined;

const style = document.createElement("style");
style.textContent = CARD_CSS;
document.head.append(style);
$("gear").innerHTML =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>';

function toast(msg: string) {
  document.querySelector(".toast")?.remove();
  const t = h("div", "toast", msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1400);
}
async function copy(text: string, msg: string) {
  await navigator.clipboard.writeText(text);
  toast(msg);
}
function btn(label: string, onClick: () => void, cls = "btn") {
  const b = h("button", cls, label);
  b.onclick = onClick;
  return b;
}

function single(p: ParsedLink, raw: string) {
  const source = detectAgent(raw);
  summary.replaceChildren(h("span", "mp-tag mp-" + p.marketplace, MP_LABEL[p.marketplace]), h("span", "mono", "#" + p.id));
  if (source) summary.append(h("span", "", "from " + source.name));
  // Viewing this product right now → add it with its photos.
  const onPage = tab?.id != null && tab.url && parseLink(tab.url)?.id === p.id;
  out.append(
    productCard(p, {
      fav: settings.fav,
      source,
      onCopy: copy,
      onPick: async (k) => {
        settings.fav = k;
        await setSettings({ fav: k });
        render();
      },
      onCatalog: onPage
        ? () => {
            chrome.runtime.sendMessage({ type: "pc-catalog", tabId: tab!.id });
            window.close();
          }
        : undefined,
      catalogLabel: "Add this page to catalog",
    }),
  );
}

function bulk(urls: string[]) {
  const agent = agentOf(settings.fav);
  const items = urls
    .map((u) => ({ u, p: parseLink(u) }))
    .filter((x): x is { u: string; p: ParsedLink } => !!x.p);
  const bad = urls.length - items.length;
  summary.replaceChildren(h("span", "", `${items.length} products${bad ? ` · ${bad} unrecognised` : ""}`));
  const box = h("div", "bulk");
  const bar = h("div", "bulk-bar");
  const originals = items.map((x) => marketplaceUrl(x.p.marketplace, x.p.id));
  if (agent) {
    const links = items.map((x) => buildAgentLink(agent.key, x.p) ?? marketplaceUrl(x.p.marketplace, x.p.id));
    bar.append(btn(`Copy all · ${agent.name}`, () => copy(links.join("\n"), `Copied ${links.length} ${agent.name} links`), "btn primary"));
  }
  bar.append(btn("Copy all · raw", () => copy(originals.join("\n"), `Copied ${originals.length} raw links`), agent ? "btn" : "btn primary"));
  const list = h("div", "list");
  for (const x of items) {
    const li = h("div", "li");
    const from = detectAgent(x.u);
    li.append(h("span", "mp-tag mp-" + x.p.marketplace, MP_LABEL[x.p.marketplace]), h("span", "mono", "#" + x.p.id));
    if (from) li.append(h("span", "", "from " + from.name));
    list.append(li);
  }
  box.append(bar, list);
  out.append(box);
}

function render() {
  out.replaceChildren();
  summary.replaceChildren();
  const text = input.value.trim();
  $("clear").hidden = !text;
  if (!text) {
    out.append(
      h("div", "empty", "Paste a Taobao, Tmall, Weidian or 1688 link to open it in your agent — or an agent link to get the raw one back. On a product page, this opens with it already filled in."),
    );
    return;
  }
  const urls = extractLinks(text);
  if (urls.length > 1) return bulk(urls);
  const raw = urls[0] ?? text;
  const p = parseLink(raw);
  if (p) return single(p, raw);
  summary.append(
    h("span", "", /tb\.cn|page\.link|sl\./i.test(raw) ? "Shortened link — open it once and paste the real product URL" : "No product found in that"),
  );
}

function renderSettings() {
  const a = agentOf(settings.fav);
  $<HTMLInputElement>("pill").checked = settings.pill;
  $<HTMLInputElement>("rewrite").checked = settings.rewrite;
  $("rewriteLabel").textContent = isRaw(settings.fav)
    ? "Turn agent links on every site back into raw links"
    : `Convert product links on every site to ${a ? a.name : "your agent"}`;
}

async function boot() {
  settings = await getSettings();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  renderSettings();
  ($("hub") as HTMLAnchorElement).href = `${APP_URL}/links/`;
  $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  const shrunk = ((await chrome.storage.local.get({ minHosts: [] })).minHosts as string[]).length > 0;
  $("unshrink").hidden = !shrunk;
  if (tab?.url && parseLink(tab.url)) input.value = tab.url; // on a product page: start with it
  render();
  input.focus();
  input.select();
}

input.addEventListener("input", render);
$("clear").addEventListener("click", () => {
  input.value = "";
  render();
  input.focus();
});
$("gear").addEventListener("click", () => {
  const s = $("settings");
  s.hidden = !s.hidden;
  $("gear").setAttribute("aria-expanded", String(!s.hidden));
});
$<HTMLInputElement>("pill").addEventListener("change", (e) => setSettings({ pill: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>("rewrite").addEventListener("change", (e) => setSettings({ rewrite: (e.target as HTMLInputElement).checked }));
$("unshrink").addEventListener("click", async () => {
  await chrome.storage.local.set({ minHosts: [] });
  $("unshrink").hidden = true;
  toast("The bar is back everywhere");
});
chrome.storage.onChanged.addListener((_c, area) => {
  if (area !== "sync") return;
  getSettings().then((s) => {
    settings = s;
    renderSettings();
  });
});
boot();
