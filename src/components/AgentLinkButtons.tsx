"use client";

import { useState } from "react";
import { AGENTS, buildAgentLink, parseLink } from "@/lib/links";
import { openAgentPicker, useFavAgent } from "@/lib/favAgent";
import { AgentIcon } from "@/components/AgentIcon";

// "Open in <agent> ↗" + "Copy <agent> link" for a product link, using the agent
// picked in the header. Renders nothing for links that aren't a Taobao / Tmall /
// Weidian / 1688 product (nothing to convert).
export function AgentLinkButtons({ url }: { url: string }) {
  const [fav] = useFavAgent();
  const [copied, setCopied] = useState(false);
  const parsed = parseLink(url);
  if (!parsed) return null;

  const agent = AGENTS.find((a) => a.key === fav) ?? null;
  const btn =
    "inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-meta transition-colors";

  if (!agent) {
    return (
      <button
        type="button"
        onClick={openAgentPicker}
        className={`${btn} border-line bg-surface2/60 text-muted hover:text-ink`}
      >
        Choose agent…
      </button>
    );
  }

  const link = buildAgentLink(agent.key, parsed);
  if (!link) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  }

  return (
    <>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border-accent bg-accent text-white hover:bg-accentSoft`}
      >
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
      <button
        type="button"
        onClick={copy}
        className={`${btn} border-line bg-surface2/60 text-ink hover:border-accent/60`}
      >
        {copied ? "✓ Copied" : `⧉ Copy ${agent.name} link`}
      </button>
    </>
  );
}
