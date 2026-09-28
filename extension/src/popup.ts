/// <reference types="chrome" />
// Toolbar popup: a pocket Link hub. Both directions — raw → your agent, agent →
// raw — plus lists of links, your agent, and the page-button settings.

import {
  AGENTS_SORTED,
  buildAgentLink,
  detectAgent,
  extractLinks,
  marketplaceUrl,
  parseLink,
  type AgentDef,
  type ParsedLink,
} from "../../src/lib/links";
import { agentOf, APP_URL, faviconUrl, getSettings, MP_LABEL, setSettings, type Settings } from "./shared";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("input");
const out = $<HTMLDivElement>("out");
const summary = $<HTMLDivElement>("summary");
const agentSel = $<HTMLSelectElement>("agent");
let settings: Settings;
let tab: chrome.tabs.Tab | undefined;

function h(tag: string, cls = "", text = ""): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}
function icon(a: AgentDef): HTMLElement {
  const w = h("span", "ico", a.name[0]);
  const img = new Image();
  img.src = faviconUrl(a.hosts[0]);
  img.onload = () => {
    w.textContent = "";
    w.append(img);
  };
  return w;
}
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
function openBtn(url: string) {
  const a = h("a", "btn", "↗") as HTMLAnchorElement;
  a.href = url;
  a.target = "_blank";
  a.title = "Open";
  return a;
}

function row(lead: HTMLElement, label: string, url: string, primary: boolean) {
  const r = h("div", "row" + (primary ? " lead" : ""));
  const t = h("div", "txt");
  t.append(h("div", "l", label), h("div", "s", url));
  r.append(lead, t, btn("Copy", () => copy(url, `Copied ${label}`), primary ? "btn primary" : "btn"), openBtn(url));
  return r;
}

function single(p: ParsedLink, raw: string) {
  const source = detectAgent(raw);
  const agent = agentOf(settings.fav);
  const original = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const reverse = !!source || !agent;

  summary.replaceChildren(h("span", "mp mp-" + p.marketplace, MP_LABEL[p.marketplace]), h("span", "mono", "#" + p.id));
  if (source) summary.append(h("span", "", "↩ from " + source.name));

  const card = h("div", "card");
  const oRow = row(h("span", "dot mp-" + p.marketplace), `${MP_LABEL[p.marketplace]} link`, original, reverse);
  const aRow = agent && agentLink ? row(icon(agent), `${agent.name} link`, agentLink, !reverse) : null;
  if (reverse) card.append(oRow, ...(aRow ? [aRow] : []));
  else card.append(aRow!, oRow);
  if (agent && !agent.verified) card.append(h("div", "warn", `${agent.name}'s format isn't confirmed yet.`));
  out.append(card);

  out.append(h("div", "k", "Every agent — click to copy"));
  const grid = h("div", "grid");
  for (const a of AGENTS_SORTED) {
    if (a.key === agent?.key || a.key === source?.key) continue;
    const l = buildAgentLink(a.key, p);
    if (!l) continue;
    const c = h("button", "chip" + (a.verified ? "" : " unv"));
    c.title = a.verified ? l : `${l}\n(format not confirmed)`;
    c.append(icon(a), document.createTextNode(a.name));
    c.onclick = () => copy(l, `Copied ${a.name} link`);
    grid.append(c);
  }
  out.append(grid);

  // Viewing this product right now → add it with its photos.
  if (tab?.id != null && tab.url && parseLink(tab.url)?.id === p.id) {
    out.append(
      btn("＋ Add this page to your catalog", () => {
        chrome.runtime.sendMessage({ type: "pc-catalog", tabId: tab!.id });
        window.close();
      }, "cat"),
    );
  }
}

function bulk(urls: string[]) {
  const agent = agentOf(settings.fav);
  const items = urls
    .map((u) => ({ u, p: parseLink(u) }))
    .filter((x): x is { u: string; p: ParsedLink } => !!x.p);
  summary.replaceChildren(h("span", "", `${items.length} products${urls.length > items.length ? ` · ${urls.length - items.length} unrecognised` : ""}`));
  const card = h("div", "card");
  const bar = h("div", "bulk");
  const originals = items.map((x) => marketplaceUrl(x.p.marketplace, x.p.id));
  if (agent) {
    const links = items.map((x) => buildAgentLink(agent.key, x.p) ?? marketplaceUrl(x.p.marketplace, x.p.id));
    bar.append(btn(`Copy all · ${agent.name}`, () => copy(links.join("\n"), `Copied ${links.length} ${agent.name} links`), "btn primary"));
  }
  bar.append(btn("Copy all · originals", () => copy(originals.join("\n"), `Copied ${originals.length} original links`), agent ? "btn" : "btn primary"));
  card.append(bar);
  const list = h("div", "list");
  for (const x of items) {
    const li = h("div", "li");
    li.append(h("span", "mp mp-" + x.p.marketplace, MP_LABEL[x.p.marketplace]), h("span", "s", "#" + x.p.id + (detectAgent(x.u) ? ` · from ${detectAgent(x.u)!.name}` : "")));
    list.append(li);
  }
  card.append(list);
  out.append(card);
}

function render() {
  out.replaceChildren();
  summary.replaceChildren();
  const text = input.value.trim();
  if (!text) {
    out.append(h("div", "empty", "Paste a Taobao, Tmall, Weidian or 1688 link — or any agent's link to get the original back."));
    return;
  }
  const urls = extractLinks(text);
  if (urls.length > 1) return bulk(urls);
  const raw = urls[0] ?? text;
  const p = parseLink(raw);
  if (p) return single(p, raw);
  summary.append(h("span", "", /tb\.cn|page\.link|sl\./i.test(raw) ? "Shortened link — open it once and paste the real product URL" : "No product found in that"));
}

function renderAgentPicker() {
  agentSel.replaceChildren(new Option("Choose agent…", ""));
  let group: HTMLOptGroupElement | null = null;
  for (const a of AGENTS_SORTED) {
    const label = a.verified ? "Confirmed" : "Unconfirmed formats";
    if (!group || group.label !== label) {
      group = document.createElement("optgroup");
      group.label = label;
      agentSel.append(group);
    }
    group.append(new Option(a.name, a.key, false, a.key === settings.fav));
  }
  const a = agentOf(settings.fav);
  $("agentIcon").replaceChildren(...(a ? [icon(a)] : []));
  $("rewriteLabel").textContent = `Convert product links on every site to ${a ? a.name : "your agent"}`;
}

async function boot() {
  settings = await getSettings();
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  renderAgentPicker();
  $<HTMLInputElement>("pill").checked = settings.pill;
  $<HTMLInputElement>("rewrite").checked = settings.rewrite;
  ($("hub") as HTMLAnchorElement).href = `${APP_URL}/links/`;
  $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  if (tab?.url && parseLink(tab.url)) input.value = tab.url; // on a product page: start with it
  render();
  input.focus();
  input.select();
}

input.addEventListener("input", render);
agentSel.addEventListener("change", async () => {
  settings.fav = agentSel.value || null;
  await setSettings({ fav: settings.fav });
  renderAgentPicker();
  render();
});
$<HTMLInputElement>("pill").addEventListener("change", (e) => setSettings({ pill: (e.target as HTMLInputElement).checked }));
$<HTMLInputElement>("rewrite").addEventListener("change", (e) => setSettings({ rewrite: (e.target as HTMLInputElement).checked }));
boot();
