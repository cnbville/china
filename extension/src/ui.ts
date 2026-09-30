/// <reference types="chrome" />
// The product card — shared by the on-page panel and the toolbar popup so both
// look and behave the same. One product, two compact rows (raw link / your
// agent, whichever you want leads), icon buttons, your agent picked right in
// its row, the other agents folded away, and "Add to catalog".

import {
  AGENTS_SORTED,
  buildAgentLink,
  marketplaceUrl,
  RAW_KEY,
  type AgentDef,
  type ParsedLink,
} from "../../src/lib/links";
import { agentOf, faviconUrl, isRaw, MP_LABEL } from "./shared";

export const h = (tag: string, cls = "", text = ""): HTMLElement => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
};

const svg = (d: string, size = 14) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
export const ICON = {
  copy: svg("M9 9h10v10H9zM5 15V5h10"),
  check: svg("M5 12.5l4.5 4.5L19 7.5"),
  open: svg("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"),
  close: svg("M6 6l12 12M18 6L6 18"),
  chevron: svg("M6 9l6 6 6-6", 12),
  plus: svg("M12 5v14M5 12h14"),
  link: svg("M9 15l6-6M10.8 6.7l1.6-1.6a3.2 3.2 0 0 1 4.5 4.5l-1.6 1.6M13.2 17.3l-1.6 1.6a3.2 3.2 0 0 1-4.5-4.5l1.6-1.6"),
  minus: svg("M6 12h12"),
};

export function agentIcon(a: AgentDef, size = 18): HTMLElement {
  const wrap = h("span", "ico");
  wrap.style.width = wrap.style.height = size + "px";
  wrap.textContent = a.name[0];
  const img = document.createElement("img");
  img.src = faviconUrl(a.hosts[0]);
  img.alt = "";
  img.onload = () => wrap.replaceChildren(img);
  return wrap;
}

export function mpDot(p: ParsedLink): HTMLElement {
  return h("span", "dot mp-" + p.marketplace);
}

/** Icon button that flips to a ✓ for a moment after copying. */
function copyBtn(text: string, msg: string, onCopy: (t: string, m: string) => void, title: string) {
  const b = h("button", "ib");
  b.title = title;
  b.innerHTML = ICON.copy;
  b.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy(text, msg);
    b.innerHTML = ICON.check;
    b.classList.add("ok");
    setTimeout(() => {
      b.innerHTML = ICON.copy;
      b.classList.remove("ok");
    }, 1200);
  };
  return b;
}
function openBtn(url: string, title: string) {
  const a = h("a", "ib") as HTMLAnchorElement;
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.title = title;
  a.innerHTML = ICON.open;
  return a;
}

/** The agent picker, styled as the row's own title ("Kakobuy ▾"). */
function agentSelect(fav: string | null, onPick: (k: string | null) => void): HTMLElement {
  const wrap = h("label", "pick");
  const sel = document.createElement("select");
  sel.append(new Option("Choose your agent", "", false, !fav));
  sel.append(new Option("Raw link (no agent)", RAW_KEY, false, isRaw(fav)));
  for (const verified of [true, false]) {
    const g = document.createElement("optgroup");
    g.label = verified ? "Agents" : "Unconfirmed formats";
    for (const a of AGENTS_SORTED.filter((x) => x.verified === verified)) {
      g.append(new Option(a.name, a.key, false, a.key === fav));
    }
    sel.append(g);
  }
  sel.onchange = () => onPick(sel.value || null);
  const caret = h("span", "caret");
  caret.innerHTML = ICON.chevron;
  wrap.append(sel, caret);
  return wrap;
}

export type CardOpts = {
  fav: string | null;
  source: AgentDef | null; // the agent this link / page came from
  onCopy: (text: string, msg: string) => void;
  onPick: (key: string | null) => void;
  onCatalog?: () => void;
  catalogLabel?: string;
  extraFooter?: HTMLElement[];
};

/** The primary link for a product: your agent's, or the raw one (reverse). */
export function primaryLink(p: ParsedLink, fav: string | null, source: AgentDef | null) {
  const agent = agentOf(fav);
  const raw = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const reverse = !!source || !agentLink;
  return {
    url: reverse ? raw : agentLink!,
    label: reverse ? `${MP_LABEL[p.marketplace]}` : agent!.name,
    agent: reverse ? null : agent,
    reverse,
  };
}

export function productCard(p: ParsedLink, o: CardOpts): HTMLElement {
  const agent = agentOf(o.fav);
  const raw = marketplaceUrl(p.marketplace, p.id);
  const agentLink = agent ? buildAgentLink(agent.key, p) : null;
  const reverse = !!o.source || !agentLink;
  const mp = MP_LABEL[p.marketplace];

  const card = h("div", "card");

  // Raw row
  const rawRow = h("div", "row" + (reverse ? " lead" : ""));
  const rawTxt = h("div", "txt");
  rawTxt.append(h("div", "l", `${mp} · raw link`), h("div", "s", raw));
  rawRow.append(
    mpDot(p),
    rawTxt,
    copyBtn(raw, `Copied raw ${mp} link`, o.onCopy, "Copy raw link"),
    openBtn(raw, `Open on ${mp}`),
  );

  // Your-agent row (the picker is its title)
  const agRow = h("div", "row" + (reverse ? "" : " lead"));
  const agTxt = h("div", "txt");
  agTxt.append(agentSelect(o.fav, o.onPick));
  if (agent && agentLink) {
    agTxt.append(h("div", "s", agent.verified ? agentLink : "Link format not confirmed yet — check it opens the right product"));
    if (!agent.verified) agTxt.lastElementChild!.classList.add("warn");
    agRow.append(
      agentIcon(agent),
      agTxt,
      copyBtn(agentLink, `Copied ${agent.name} link`, o.onCopy, `Copy ${agent.name} link`),
      openBtn(agentLink, `Open in ${agent.name}`),
    );
  } else {
    const ph = h("span", "ico raw");
    ph.innerHTML = ICON.link;
    agTxt.append(h("div", "s", isRaw(o.fav) ? "Links stay raw — pick an agent to convert" : "Pick the agent you buy through"));
    agRow.append(ph, agTxt);
  }

  const rows = h("div", "rows");
  rows.append(...(reverse ? [rawRow, agRow] : [agRow, rawRow]));
  card.append(rows);

  // Other agents, folded away (confirmed first, unconfirmed one more fold down)
  const others = AGENTS_SORTED.filter((a) => a.key !== agent?.key && a.key !== o.source?.key);
  const chip = (a: AgentDef) => {
    const l = buildAgentLink(a.key, p)!;
    const c = h("span", "chip" + (a.verified ? "" : " unv"));
    const open = h("a", "cn") as HTMLAnchorElement;
    open.href = l;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.title = `Open in ${a.name}${a.verified ? "" : " (format not confirmed)"}`;
    open.append(agentIcon(a, 14), document.createTextNode(a.name));
    c.append(open, copyBtn(l, `Copied ${a.name} link`, o.onCopy, `Copy ${a.name} link`));
    return c;
  };
  const conf = others.filter((a) => a.verified);
  const unconf = others.filter((a) => !a.verified);
  const more = document.createElement("details");
  more.className = "more";
  const sum = document.createElement("summary");
  sum.innerHTML = `<span>Other agents</span><span class="n">${others.length}</span>${ICON.chevron}`;
  const grid = h("div", "grid");
  grid.append(...conf.map(chip));
  more.append(sum, grid);
  if (unconf.length) {
    const un = document.createElement("details");
    un.className = "more sub";
    const s2 = document.createElement("summary");
    s2.innerHTML = `<span>Unconfirmed formats</span><span class="n">${unconf.length}</span>${ICON.chevron}`;
    const g2 = h("div", "grid");
    g2.append(...unconf.map(chip));
    un.append(s2, g2);
    more.append(un);
  }
  card.append(more);

  // Footer: add to catalog (+ host-specific extras)
  if (o.onCatalog || o.extraFooter?.length) {
    const foot = h("div", "foot");
    if (o.onCatalog) {
      const cat = h("button", "cat");
      cat.innerHTML = ICON.plus;
      cat.append(document.createTextNode(o.catalogLabel ?? "Add to catalog"));
      cat.title = "Opens your catalog's add form with the title, price and every photo";
      cat.onclick = o.onCatalog;
      foot.append(cat);
    }
    foot.append(...(o.extraFooter ?? []));
    card.append(foot);
  }
  return card;
}

// Shared styles (the page panel's shadow root and the popup both load these).
export const CARD_CSS = `
.card{color:#ecedf1;font-size:13px;line-height:1.3}
.rows{border:1px solid rgba(255,255,255,.08);border-radius:12px;overflow:hidden;background:rgba(255,255,255,.02)}
.row{display:flex;align-items:center;gap:10px;padding:9px 8px 9px 11px}
.row+.row{border-top:1px solid rgba(255,255,255,.07)}
.row.lead{background:linear-gradient(90deg,rgba(255,46,67,.12),rgba(255,46,67,.03))}
.txt{min-width:0;flex:1}
.l{font-size:13px;font-weight:500;color:#ecedf1}
.s{font:10.5px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b8f9c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.s.warn{font-family:inherit;color:#fcd34d;white-space:normal}
.dot{flex:none;width:10px;height:10px;margin:0 4px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor}
.mp-taobao{color:#ff8a3d}.mp-tmall{color:#ff4d6d}.mp-weidian{color:#ff5a3c}.mp-1688{color:#ffa62b}
.ico{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;border-radius:5px;background:#fff;color:#111;font-size:9px;font-weight:700;overflow:hidden}
.ico img{width:100%;height:100%;object-fit:cover}
.ico.raw{background:rgba(255,46,67,.15);color:#ff8f9a;border:1px solid rgba(255,46,67,.35)}
.ib{all:unset;cursor:pointer;display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:8px;color:#aeb2bd;transition:background .15s,color .15s}
.ib:hover{background:rgba(255,255,255,.08);color:#fff}
.ib.ok{color:#34d399}
.lead .ib{color:#ffb3ba}
.pick{position:relative;display:inline-flex;align-items:center;gap:2px;max-width:100%;cursor:pointer}
.pick select{all:unset;field-sizing:content;cursor:pointer;font-size:13px;font-weight:500;color:#ecedf1;padding-right:16px;max-width:100%;text-overflow:ellipsis}
.pick select option,.pick select optgroup{background:#1a1c24;color:#ecedf1}
.pick .caret{position:absolute;right:0;top:50%;transform:translateY(-50%);color:#8b8f9c;pointer-events:none;display:flex}
.pick:hover select{color:#fff}
.more{margin-top:8px}
.more summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 4px;color:#8b8f9c;font-size:11px;letter-spacing:.14em;text-transform:uppercase;user-select:none}
.more summary::-webkit-details-marker{display:none}
.more summary:hover{color:#ecedf1}
.more summary .n{letter-spacing:0;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.07);font-size:10px}
.more summary svg{margin-left:auto;transition:transform .15s}
.more[open]>summary svg{transform:rotate(180deg)}
.more.sub{margin-top:4px}
.grid{display:flex;flex-wrap:wrap;gap:5px;padding:2px 2px 4px}
.chip{display:inline-flex;align-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02)}
.chip:hover{border-color:rgba(255,255,255,.28)}
.chip.unv{border-style:dashed}
.chip.unv .cn{color:#9da1ad}
.cn{display:inline-flex;align-items:center;gap:5px;padding:3px 2px 3px 4px;color:#ecedf1;text-decoration:none;font-size:11.5px}
.chip .ib{width:20px;height:20px;border-radius:999px;opacity:.35;margin-right:1px}
.chip:hover .ib,.chip .ib.ok{opacity:1}
.chip .ib svg{width:11px;height:11px}
.foot{display:flex;align-items:center;gap:6px;margin-top:10px}
.cat{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,46,67,.35);background:rgba(255,46,67,.1);color:#ff9aa4;font-size:12px}
.cat:hover{background:rgba(255,46,67,.2);color:#fff}
.ghost{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;padding:7px 10px;border-radius:999px;color:#8b8f9c;font-size:12px}
.ghost:hover{color:#ecedf1;background:rgba(255,255,255,.06)}
`;
