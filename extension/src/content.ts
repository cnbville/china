/// <reference types="chrome" />
// Runs on every page:
//  • product pages (Taobao / Tmall / Weidian / 1688 or any agent's item page):
//    a small floating button — your agent, the original link, every agent,
//    add to catalog;
//  • everywhere else (Reddit, Discord web, spreadsheets …), if you turned it on:
//    product links point at your agent instead;
//  • the Personal Catalog site: picks up the agent you chose there.

import {
  AGENTS_SORTED,
  BARE_HOSTS,
  buildAgentLink,
  detectAgent,
  marketplaceUrl,
  outputLink,
  parseLink,
  RAW_KEY,
  type AgentDef,
  type ParsedLink,
} from "../../src/lib/links";
import { agentOf, APP_URL, faviconUrl, getSettings, isRaw, MP_LABEL, onSettings, setSettings, type Settings } from "./shared";

let settings: Settings = { fav: null, pill: true, rewrite: false };

const host = location.hostname.toLowerCase();
const onKnownSite = BARE_HOSTS.some((h) => host === h || host.endsWith("." + h));
const onCatalog = location.href.startsWith(APP_URL);

// --- Shadow-DOM UI (the page's CSS can't touch it) --------------------------
let root: ShadowRoot | null = null;
function ui(): ShadowRoot {
  if (root) return root;
  const hostEl = document.createElement("pc-links");
  hostEl.style.cssText = "all:initial;position:fixed;z-index:2147483647;inset:auto 0 0 auto;";
  document.documentElement.appendChild(hostEl);
  root = hostEl.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  return root;
}

function toast(msg: string) {
  const r = ui();
  r.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  r.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

async function copy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(msg);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "pc-copy") return;
  if (msg.text) copy(msg.text, msg.toast);
  else toast(msg.toast);
});

// --- Floating button on product pages ---------------------------------------
const h = (tag: string, cls = "", text = ""): HTMLElement => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

function icon(a: AgentDef, size = 18): HTMLElement {
  const wrap = h("span", "ico");
  wrap.style.width = wrap.style.height = size + "px";
  wrap.textContent = a.name[0];
  const img = document.createElement("img");
  img.src = faviconUrl(a.hosts[0]);
  img.alt = "";
  img.onload = () => {
    wrap.textContent = "";
    wrap.appendChild(img);
  };
  return wrap;
}

let hiddenFor = "";
let openPanel = false;
let current = "";

function renderPill() {
  const href = location.href;
  const p = settings.pill && !onCatalog ? parseLink(href) : null;
  const r = ui();
  r.querySelector(".pill")?.remove();
  if (!p || hiddenFor === href) return;
  current = href;

  const source = detectAgent(href);
  const agent = agentOf(settings.fav);
  const original = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const reverse = !!source || !agent; // on an agent's page, the raw link leads

  const pill = h("div", "pill" + (openPanel ? " open" : ""));

  // Panel (details)
  const panel = h("div", "panel");
  const head = h("div", "head");
  const tag = h("span", "mp mp-" + p.marketplace, MP_LABEL[p.marketplace]);
  head.append(tag, h("span", "id", "#" + p.id));
  if (source) head.append(h("span", "from", "↩ from " + source.name));
  const x = h("button", "x", "×");
  x.title = "Hide on this page";
  x.onclick = () => {
    hiddenFor = href;
    renderPill();
  };
  head.append(x);
  panel.append(head);

  const row = (label: string, sub: string, link: string | null, lead: HTMLElement) => {
    const el = h("div", "row");
    const txt = h("div", "txt");
    txt.append(h("div", "l", label), h("div", "s", sub));
    el.append(lead, txt);
    if (link) {
      const c = h("button", "b", "Copy");
      c.onclick = () => copy(link, `Copied ${label}`);
      const o = h("a", "b", "Open ↗") as HTMLAnchorElement;
      o.href = link;
      o.target = "_blank";
      o.rel = "noreferrer";
      el.append(c, o);
    }
    return el;
  };
  const dot = h("span", "dot mp-" + p.marketplace);
  panel.append(row(`${MP_LABEL[p.marketplace]} link`, original, original, dot));

  // Your agent — pick right here.
  const sel = document.createElement("select");
  sel.className = "sel";
  sel.append(new Option("Choose your agent…", ""));
  sel.append(new Option("Raw link — the original", RAW_KEY, false, isRaw(settings.fav)));
  for (const a of AGENTS_SORTED) sel.append(new Option(a.name + (a.verified ? "" : " (?)"), a.key, false, a.key === settings.fav));
  sel.onchange = () => setSettings({ fav: sel.value || null });
  if (agent && agentLink) {
    const ar = row(`${agent.name} link`, agentLink, agentLink, icon(agent));
    panel.append(ar);
    if (!agent.verified) panel.append(h("div", "warn", `${agent.name}'s link format isn't confirmed yet.`));
  }
  const pickRow = h("div", "pick");
  pickRow.append(h("span", "k", "Your agent"), sel);
  panel.append(pickRow);

  const cat = h("button", "cat", "＋ Add to catalog — title, price & every photo");
  cat.onclick = () => {
    chrome.runtime.sendMessage({ type: "pc-catalog" });
    toast("Opening your catalog…");
  };
  panel.append(cat);

  panel.append(h("div", "k all", "All agents — click to open"));
  const grid = h("div", "grid");
  for (const a of AGENTS_SORTED) {
    if (a.key === source?.key || a.key === agent?.key) continue;
    const l = buildAgentLink(a.key, p);
    if (!l) continue;
    const chip = h("a", "chip" + (a.verified ? "" : " unv")) as HTMLAnchorElement;
    chip.href = l;
    chip.target = "_blank";
    chip.rel = "noreferrer";
    chip.title = a.verified ? `Open in ${a.name}` : `Open in ${a.name} — format not confirmed`;
    chip.append(icon(a, 14), document.createTextNode(a.name));
    grid.append(chip);
  }
  panel.append(grid);
  pill.append(panel);

  // Bar (always visible)
  const bar = h("div", "bar");
  const logo = document.createElement("img");
  logo.className = "logo";
  logo.src = chrome.runtime.getURL("icons/icon-128.png");
  logo.alt = "";
  logo.title = "Personal Catalog";
  const main = h("a", "main") as HTMLAnchorElement;
  main.target = "_blank";
  main.rel = "noreferrer";
  if (reverse) {
    main.href = original;
    main.textContent = `${MP_LABEL[p.marketplace]} ↗`;
    main.title = "Open the original link";
  } else {
    main.href = agentLink!;
    main.append(icon(agent!, 16), document.createTextNode(`${agent!.name} ↗`));
    main.title = `Open in ${agent!.name}`;
  }
  const cp = h("button", "cp", "Copy");
  const primary = reverse ? original : agentLink!;
  cp.onclick = () => copy(primary, reverse ? `Copied original ${MP_LABEL[p.marketplace]} link` : `Copied ${agent!.name} link`);
  const more = h("button", "more", openPanel ? "▾" : "▴");
  more.title = "More";
  more.onclick = () => {
    openPanel = !openPanel;
    renderPill();
  };
  bar.append(logo, main, cp, more);
  pill.append(bar);
  r.appendChild(pill);
}

// --- Rewrite product links on other sites -----------------------------------
const ORIG = "data-pc-orig";
function rewriteAll() {
  const on = settings.rewrite && !!settings.fav && !onKnownSite && !onCatalog;
  const label = isRaw(settings.fav) ? "Raw link" : agentOf(settings.fav)?.name ?? "";
  document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    const orig = a.getAttribute(ORIG);
    if (!on) {
      if (orig) {
        a.href = orig;
        a.removeAttribute(ORIG);
      }
      return;
    }
    const from = orig ?? a.href;
    let p: ParsedLink | null = null;
    try {
      p = parseLink(from);
    } catch {
      p = null;
    }
    if (!p) return;
    const to = outputLink(settings.fav, p);
    if (!to || a.href === to) return;
    if (!orig) a.setAttribute(ORIG, from);
    a.href = to;
    a.title = a.title || `${label} · ${MP_LABEL[p.marketplace]} #${p.id}`;
  });
}
let pending = 0;
const observer = new MutationObserver(() => {
  if (pending) return;
  pending = window.setTimeout(() => {
    pending = 0;
    rewriteAll();
  }, 300);
});

// --- Pick up the agent chosen on the Personal Catalog site -------------------
function syncFromSite() {
  if (!onCatalog) return;
  try {
    const k = localStorage.getItem("link-fav-agent");
    if (k && k !== settings.fav && (isRaw(k) || agentOf(k))) setSettings({ fav: k });
  } catch {
    /* ignore */
  }
}

// --- Boot -------------------------------------------------------------------
function apply(s: Settings) {
  settings = s;
  renderPill();
  rewriteAll();
  if (s.rewrite && !onKnownSite && !onCatalog) observer.observe(document.documentElement, { childList: true, subtree: true });
  else observer.disconnect();
}

getSettings().then((s) => {
  apply(s);
  syncFromSite();
});
onSettings(apply);
if (onCatalog) {
  window.addEventListener("fav-agent-change", syncFromSite);
  document.addEventListener("visibilitychange", syncFromSite);
}
// Single-page shops change the URL without reloading.
setInterval(() => {
  if (location.href !== current && (parseLink(location.href) || current)) {
    openPanel = false;
    current = location.href;
    renderPill();
  }
}, 1000);

const CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.pill{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;color:#ecedf1;font-size:13px;line-height:1.3}
.bar{display:flex;align-items:center;gap:6px;padding:5px;border-radius:999px;background:rgba(14,15,20,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 40px rgba(0,0,0,.45),0 0 0 1px rgba(255,46,67,.18)}
.logo{width:26px;height:26px;border-radius:8px;box-shadow:0 0 14px rgba(255,46,67,.45)}
.main{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:#ff2e43;color:#fff;text-decoration:none;font-weight:600;white-space:nowrap}
.main:hover{background:#ff4556}
.cp,.more{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;color:#c9cbd3;font-size:12px}
.cp:hover,.more:hover{background:rgba(255,255,255,.08);color:#fff}
.panel{display:none;width:320px;max-height:70vh;overflow:auto;padding:12px;border-radius:16px;background:rgba(14,15,20,.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 60px rgba(0,0,0,.55)}
.open .panel{display:block}
.head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.mp{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid currentColor}
.mp-taobao{color:#ff8a3d}.mp-tmall{color:#ff4d6d}.mp-weidian{color:#ff5a3c}.mp-1688{color:#ffa62b}
.id{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.from{color:#8b8f9c;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x{all:unset;cursor:pointer;margin-left:auto;color:#8b8f9c;font-size:18px;line-height:1;padding:0 4px}.x:hover{color:#fff}
.row{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.07)}
.txt{min-width:0;flex:1}.l{font-size:12.5px}.s{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#8b8f9c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dot{width:10px;height:10px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor;margin:0 4px}
.b{all:unset;cursor:pointer;padding:4px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.14);font-size:11px;color:#ecedf1;white-space:nowrap}
.b:hover{border-color:rgba(255,46,67,.6);color:#ff8f9a}
.warn{font-size:11px;color:#fcd34d;margin:-2px 0 6px 26px}
.pick{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.07)}
.k{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8b8f9c;white-space:nowrap}
.sel{flex:1;min-width:0;background:#1a1c24;color:#ecedf1;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:5px 6px;font-size:12px}
.cat{all:unset;cursor:pointer;display:block;width:100%;text-align:center;margin:6px 0 10px;padding:8px;border-radius:10px;background:rgba(255,46,67,.12);border:1px solid rgba(255,46,67,.35);color:#ff9aa4;font-size:12.5px;box-sizing:border-box}
.cat:hover{background:rgba(255,46,67,.2);color:#fff}
.all{margin-bottom:6px}
.grid{display:flex;flex-wrap:wrap;gap:5px}
.chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px 3px 4px;border-radius:999px;border:1px solid rgba(255,255,255,.12);color:#ecedf1;text-decoration:none;font-size:11.5px}
.chip:hover{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.05)}
.chip.unv{border-style:dashed;color:#9da1ad}
.ico{display:inline-grid;place-items:center;flex:none;border-radius:4px;background:#fff;color:#111;font-size:9px;font-weight:700;overflow:hidden}
.ico img{width:100%;height:100%;object-fit:cover}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(14,15,20,.94);color:#ecedf1;font-size:13px;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.5);white-space:nowrap}
`;
