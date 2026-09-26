"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGENTS,
  buildAgentLink,
  detectAgent,
  marketplaceUrl,
  parseLink,
} from "@/lib/links";

// Paste any direct or agent link → rebuild it for your target agent. All local,
// no network. Encrypted/shortened links (m.tb.cn, …) can't be resolved here yet.
const AGENT_KEY = "link-target-agent";

const MP_LABEL: Record<string, string> = {
  taobao: "Taobao",
  tmall: "Tmall",
  weidian: "Weidian",
  "1688": "1688",
};

export function LinkConverter() {
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<string>(AGENTS[0].key);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AGENT_KEY);
      if (saved && AGENTS.some((a) => a.key === saved)) setTarget(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function pickTarget(key: string) {
    setTarget(key);
    try {
      localStorage.setItem(AGENT_KEY, key);
    } catch {
      /* ignore */
    }
  }

  const parsed = useMemo(() => (input.trim() ? parseLink(input) : null), [input]);
  const sourceAgent = useMemo(
    () => (input.trim() ? detectAgent(input) : null),
    [input],
  );
  const output = useMemo(
    () => (parsed ? buildAgentLink(target, parsed) : null),
    [parsed, target],
  );
  const directUrl = parsed ? marketplaceUrl(parsed.marketplace, parsed.id) : null;

  const looksEncrypted =
    !parsed &&
    input.trim().length > 0 &&
    /m\.tb\.cn|tb\.cn|page\.link|kakobuy\.com\/#|sl\.|\.short|1688\.com\/x/i.test(
      input,
    );

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
        <span className="text-meta uppercase tracking-[0.2em] text-muted">
          Tools
        </span>
      </div>
      <h1 className="font-serif text-4xl leading-tight">Link converter</h1>
      <p className="mt-2 text-meta text-muted">
        Paste a Taobao / Weidian / 1688 link — direct or from any agent — and get
        it back in your agent&rsquo;s format.
      </p>

      <div className="mt-6 space-y-3 rounded-card border border-line bg-card/70 p-5 shadow-lift">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste any product or agent link…"
          rows={3}
          className="input font-mono text-[12px] leading-snug"
        />

        {/* Detected */}
        {input.trim() && (
          <div className="text-meta">
            {parsed ? (
              <span className="text-muted">
                Detected:{" "}
                <span className="text-ink">{MP_LABEL[parsed.marketplace]}</span>
                {" · "}
                <span className="text-ink tnum">{parsed.id}</span>
                {sourceAgent && (
                  <span className="text-muted"> · via {sourceAgent.name}</span>
                )}
              </span>
            ) : looksEncrypted ? (
              <span className="text-accentSoft">
                Looks like a shortened/encrypted link — those need a server to
                unwrap (coming as a fallback). Open it once and paste the real
                product URL for now.
              </span>
            ) : (
              <span className="text-muted">
                Couldn&rsquo;t read a product from that link.
              </span>
            )}
          </div>
        )}

        {/* Target agent */}
        <div className="flex items-center gap-2">
          <label className="text-meta text-muted">Convert to</label>
          <select
            value={target}
            onChange={(e) => pickTarget(e.target.value)}
            className="input flex-1"
          >
            {AGENTS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Output */}
        {output && (
          <div className="rounded-card border border-line bg-surface2/50 p-3">
            <div className="break-all font-mono text-[12px] text-ink">
              {output}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => copy(output)}
                className="btn-accent px-3 py-1.5 text-meta"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <a
                href={output}
                target="_blank"
                rel="noreferrer"
                className="rounded-pill px-3 py-1.5 text-meta text-accentSoft/90 transition-colors hover:bg-surface2 hover:text-accentSoft"
              >
                Open ↗
              </a>
              {directUrl && (
                <button
                  onClick={() => copy(directUrl)}
                  className="ml-auto text-meta text-muted hover:text-ink"
                  title="Copy the plain marketplace link"
                >
                  Copy direct
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-meta text-muted">
        {AGENTS.length} agents supported. If a link doesn&rsquo;t convert, it may
        be an agent I haven&rsquo;t added yet — paste it to me and I&rsquo;ll add
        it.
      </p>
    </div>
  );
}
