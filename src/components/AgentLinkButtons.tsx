"use client";

import { useState } from "react";
import { AGENTS, RAW_KEY, buildAgentLink, marketplaceUrl, parseLink } from "@/lib/links";
import { openAgentPicker, useFavAgent } from "@/lib/favAgent";
import { AgentIcon, RawIcon } from "@/components/AgentIcon";
import { doppelQueries, doppelSearchUrl } from "@/lib/doppel";

const MP_LABEL = { taobao: "Taobao", tmall: "Tmall", weidian: "Weidian", "1688": "1688" } as const;

// "Open in <agent> ↗" + "Copy <agent> link" for a saved product link, using the
// agent picked in the header — plus the raw original (Taobao / Tmall / Weidian /
// 1688), so a link saved from CSSBuy, CNFans … is one tap from the real listing.
// If "Raw link" is your pick, the raw link leads. Renders nothing for links that
// aren't a product (nothing to convert).
//
// `compact` is the small pill style used in the Later / Junk card footers.
export function AgentLinkButtons({
  url,
  title,
  compact = false,
}: {
  url: string;
  title?: string | null; // your name for it — doppel.fit searches by it first
  compact?: boolean;
}) {
  const [fav] = useFavAgent();
  const [copied, setCopied] = useState<string | null>(null);
  const parsed = parseLink(url);
  if (!parsed) return null;

  const agent = AGENTS.find((a) => a.key === fav) ?? null;
  const rawPick = fav === RAW_KEY;
  const raw = marketplaceUrl(parsed.marketplace, parsed.id);
  const mp = MP_LABEL[parsed.marketplace];
  const agentLink = agent ? buildAgentLink(agent.key, parsed) : null;
  // doppel.fit: the extension types this into its search (name you gave it first).
  const doppel = doppelSearchUrl(doppelQueries(parsed, title, true), title || `${MP_LABEL[parsed.marketplace]} #${parsed.id}`);
  // The raw link is worth offering whenever what you saved isn't already it.
  const showRaw = rawPick || url.trim() !== raw;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  if (compact) {
    const pill =
      "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-meta transition-colors hover:bg-surface2";
    return (
      <>
        {agent && agentLink && (
          <a href={agentLink} target="_blank" rel="noreferrer" className={`${pill} text-accentSoft/90 hover:text-accentSoft`} title={`Open in ${agent.name}`}>
            {agent.name} ↗
          </a>
        )}
        {showRaw && (
          <span className="inline-flex items-center">
            <a href={raw} target="_blank" rel="noreferrer" className={`${pill} ${rawPick ? "text-accentSoft/90 hover:text-accentSoft" : "text-muted hover:text-ink"}`} title={`Open the raw ${mp} link`}>
              Raw {mp} ↗
            </a>
            <button type="button" onClick={() => copy("raw", raw)} className={`${pill} !px-1.5 text-muted hover:text-ink`} title={`Copy the raw ${mp} link`}>
              {copied === "raw" ? "✓" : "⧉"}
            </button>
          </span>
        )}
        <a href={doppel} target="_blank" rel="noreferrer" className={`${pill} text-muted hover:text-ink`} title="Search doppel.fit for this (the extension types it in)">
          doppel ↗
        </a>
      </>
    );
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-meta transition-colors";
  const primary = `${btn} border-accent bg-accent text-white hover:bg-accentSoft`;
  const ghost = `${btn} border-line bg-surface2/60 text-ink hover:border-accent/60`;

  const rawButtons = (lead: boolean) => (
    <>
      <a href={raw} target="_blank" rel="noopener noreferrer" className={lead ? primary : ghost} title={raw}>
        {lead ? <RawIcon size="sm" /> : null}
        {lead ? `Open raw ${mp} link ↗` : `Raw ${mp} ↗`}
      </a>
      <button type="button" onClick={() => copy("raw", raw)} className={ghost}>
        {copied === "raw" ? "✓ Copied" : lead ? `⧉ Copy raw link` : "⧉ Raw"}
      </button>
    </>
  );

  const doppelButton = (
    <a href={doppel} target="_blank" rel="noopener noreferrer" className={ghost} title="Search doppel.fit for this (the extension types it in)">
      ⌕ doppel.fit
    </a>
  );

  if (rawPick)
    return (
      <>
        {rawButtons(true)}
        {doppelButton}
      </>
    );

  return (
    <>
      {agent && agentLink ? (
        <>
          <a href={agentLink} target="_blank" rel="noopener noreferrer" className={primary}>
            <AgentIcon host={agent.hosts[0]} name={agent.name} size="sm" />
            Open in {agent.name} ↗
          </a>
          {!agent.verified && (
            <span
              title={`${agent.name}'s link format isn't confirmed yet — check it opens the right product`}
              className="text-[11px] text-amber-300/90"
            >
              unconfirmed format
            </span>
          )}
          <button type="button" onClick={() => copy("agent", agentLink)} className={ghost}>
            {copied === "agent" ? "✓ Copied" : `⧉ Copy ${agent.name} link`}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={openAgentPicker}
          className={`${btn} border-line bg-surface2/60 text-muted hover:text-ink`}
        >
          Choose agent…
        </button>
      )}
      {showRaw && rawButtons(false)}
      {doppelButton}
    </>
  );
}
