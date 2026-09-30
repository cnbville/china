/// <reference types="chrome" />
// Runs on every page:
//  • product pages (Taobao / Tmall / Weidian / 1688 or any agent's item page):
//    a small floating bar — open in your agent (or the raw link on an agent's
//    page), copy it, and a panel with both links, every agent and "Add to
//    catalog". Shrinks to a dot per site if it's in the way;
//  • everywhere else (Reddit, Discord web, spreadsheets …), if you turned it on:
//    product links point at your agent instead;
//  • the Personal Catalog site: picks up the agent you chose there.

import { BARE_HOSTS, detectAgent, outputLink, parseLink, type ParsedLink } from "../../src/lib/links";
import { agentOf, APP_URL, getSettings, isRaw, MP_LABEL, onSettings, setSettings, type Settings } from "./shared";
import { agentIcon, CARD_CSS, h, ICON, primaryLink, productCard } from "./ui";

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
// Three states: a small dot (minimised on this site), the bar (primary link +
// copy), and the panel (the shared product card) above the bar.

let hiddenFor = "";
let openPanel = false;
let current = "";
let minimised = false; // per site, remembered in chrome.storage.local
const MIN_KEY = "minHosts";

chrome.storage.local.get({ [MIN_KEY]: [] as string[] }).then((v) => {
  minimised = (v[MIN_KEY] as string[]).includes(host);
  renderPill();
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c[MIN_KEY]) {
    minimised = ((c[MIN_KEY].newValue as string[]) ?? []).includes(host);
    renderPill();
  }
});
async function setMinimised(on: boolean) {
  minimised = on;
  openPanel = false;
  const v = await chrome.storage.local.get({ [MIN_KEY]: [] as string[] });
  const list = (v[MIN_KEY] as string[]).filter((x) => x !== host);
  if (on) list.push(host);
  await chrome.storage.local.set({ [MIN_KEY]: list });
  renderPill();
}

function logoImg(): HTMLImageElement {
  const img = document.createElement("img");
  img.src = chrome.runtime.getURL("icons/icon-128.png");
  img.alt = "";
  return img;
}

function renderPill() {
  const href = location.href;
  const p = settings.pill && !onCatalog ? parseLink(href) : null;
  const r = ui();
  r.querySelector(".pill")?.remove();
  if (!p || hiddenFor === href) return;
  current = href;

  const pill = h("div", "pill" + (openPanel ? " open" : ""));

  if (minimised) {
    const dotBtn = h("button", "mini");
    dotBtn.title = "Personal Catalog — convert this product";
    dotBtn.append(logoImg());
    dotBtn.onclick = () => setMinimised(false);
    pill.append(dotBtn);
    r.appendChild(pill);
    return;
  }

  const source = detectAgent(href);
  const prim = primaryLink(p, settings.fav, source);

  // Panel
  if (openPanel) {
    const panel = h("div", "panel");
    const head = h("div", "head");
    head.append(h("span", "mp-tag mp-" + p.marketplace, MP_LABEL[p.marketplace]), h("span", "id", "#" + p.id));
    if (source) head.append(h("span", "from", "from " + source.name));
    const x = h("button", "ib hx");
    x.innerHTML = ICON.close;
    x.title = "Hide on this page";
    x.onclick = () => {
      hiddenFor = href;
      renderPill();
    };
    head.append(x);

    const mini = h("button", "ghost");
    mini.innerHTML = ICON.minus;
    mini.append(document.createTextNode("Shrink on this site"));
    mini.title = "Keep just a small dot on this site";
    mini.onclick = () => setMinimised(true);

    panel.append(
      head,
      productCard(p, {
        fav: settings.fav,
        source,
        onCopy: copy,
        onPick: (k) => setSettings({ fav: k }),
        onCatalog: () => {
          chrome.runtime.sendMessage({ type: "pc-catalog" });
          toast("Opening your catalog…");
        },
        extraFooter: [mini],
      }),
    );
    pill.append(panel);
  }

  // Bar
  const bar = h("div", "bar");
  const logo = h("button", "logo");
  logo.title = openPanel ? "Close" : "More options";
  logo.append(logoImg());
  logo.onclick = () => {
    openPanel = !openPanel;
    renderPill();
  };
  const main = h("a", "main") as HTMLAnchorElement;
  main.href = prim.url;
  main.target = "_blank";
  main.rel = "noreferrer";
  main.title = prim.reverse ? `Open the raw ${prim.label} link` : `Open in ${prim.label}`;
  if (prim.agent) main.append(agentIcon(prim.agent, 16));
  main.append(document.createTextNode(prim.reverse ? `Open on ${prim.label}` : `Open in ${prim.label}`));
  const cp = h("button", "ib");
  cp.innerHTML = ICON.copy;
  cp.title = "Copy this link";
  cp.onclick = () => {
    copy(prim.url, prim.reverse ? `Copied raw ${prim.label} link` : `Copied ${prim.label} link`);
    cp.innerHTML = ICON.check;
    cp.classList.add("ok");
    setTimeout(() => {
      cp.innerHTML = ICON.copy;
      cp.classList.remove("ok");
    }, 1200);
  };
  const more = h("button", "ib tog");
  more.innerHTML = ICON.chevron;
  more.title = openPanel ? "Close" : "More options";
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
.bar{display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:rgba(13,14,19,.9);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 32px rgba(0,0,0,.45)}
.logo,.mini{all:unset;cursor:pointer;display:grid;place-items:center;flex:none;border-radius:999px}
.logo{width:30px;height:30px;margin-right:2px}
.logo img{width:24px;height:24px;border-radius:7px}
.mini{width:40px;height:40px;background:rgba(13,14,19,.9);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 24px rgba(0,0,0,.45);opacity:.75;transition:opacity .15s,transform .15s}
.mini:hover{opacity:1;transform:scale(1.06)}
.mini img{width:26px;height:26px;border-radius:7px}
.main{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 13px 0 11px;border-radius:999px;background:#ff2e43;color:#fff;text-decoration:none;font-weight:600;font-size:13px;white-space:nowrap}
.main:hover{background:#ff4556}
.main .ico{width:16px;height:16px}
.bar .ib{width:30px;height:30px;border-radius:999px}
.tog svg{transition:transform .15s;transform:rotate(180deg)}
.open .tog svg{transform:none}
.panel{width:330px;max-height:min(70vh,560px);overflow:auto;padding:12px;border-radius:16px;background:rgba(13,14,19,.94);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 60px rgba(0,0,0,.55);animation:rise .18s ease-out}
@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.head{display:flex;align-items:center;gap:8px;margin:0 0 10px 2px}
.mp-tag{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid currentColor}
.id{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#ecedf1}
.from{color:#8b8f9c;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.head .hx{margin-left:auto;width:24px;height:24px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:rgba(13,14,19,.94);color:#ecedf1;font-size:13px;border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.5);white-space:nowrap}
` + CARD_CSS;
