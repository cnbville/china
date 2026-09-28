"use client";

import Link from "next/link";
import { Header } from "@/components/Header";
import manifest from "../../../extension/manifest.json";

// Download + install page for the browser extension (Opera GX / Chrome / Edge
// / Brave). The zip is built by the deploy (npm run build:extension) and served
// right next to this page.

const ZIP = "/china/extension/personal-catalog-links.zip";

const FEATURES = [
  {
    title: "On every product page",
    body: "Taobao, Tmall, Weidian, 1688 — or any agent's item page. A small button opens it in your agent, or back to the original link. Every other agent is one click away.",
    icon: "M4 5h16v11H4zM8 20h8M12 16v4",
  },
  {
    title: "Right-click any link",
    body: "Open in your agent, copy your agent's link, or copy the clean original — straight from Reddit, Discord or a spreadsheet.",
    icon: "M5 3l14 8-6 2-2 6z",
  },
  {
    title: "Add to catalog",
    body: "One click on a product page: title, price and every photo land in your add-item form — like the bookmarklet, without the bookmark.",
    icon: "M12 5v14M5 12h14",
  },
  {
    title: "Auto-convert (optional)",
    body: "Turn it on and product links on every site point at your agent. Off by default; one switch in the popup.",
    icon: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  },
];

const STEPS: React.ReactNode[] = [
  <>
    <a href={ZIP} className="text-accentSoft underline">Download the zip</a> and
    double-click it — you get a folder called{" "}
    <Code>personal-catalog-links</Code>. Move it somewhere it can stay (e.g.
    Documents). <span className="text-ink">Don&rsquo;t delete it later</span> —
    Opera runs the extension from that folder.
  </>,
  <>
    In Opera GX, type <Code>opera://extensions</Code> in the address bar and
    press Enter.
  </>,
  <>
    Switch on <span className="text-ink">Developer mode</span> (top right).
  </>,
  <>
    Click <span className="text-ink">Load unpacked</span> and pick the{" "}
    <Code>personal-catalog-links</Code> folder.
  </>,
  <>
    Pin it: click the cube icon next to the address bar → the pin next to{" "}
    <span className="text-ink">Personal Catalog — Links</span>. Open its popup
    once and choose your agent (or just open this site — it picks up the agent
    you chose here).
  </>,
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[5px] border border-line bg-surface2/70 px-1.5 py-px font-mono text-[12px] text-ink">
      {children}
    </code>
  );
}

export default function ExtensionPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(60% 60% at 50% 40%, rgba(255,46,67,0.16), transparent 70%)" }}
          />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-pill border border-line/80 bg-card/50 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
              Browser extension · v{manifest.version}
            </span>
            <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight text-sheen">
              Links, everywhere.
            </h1>
            <p className="mt-2 text-body text-muted">
              The Link hub, built into your browser — convert to your agent and
              back on any page, right-click any link, add products with every
              photo. Opera GX, Chrome, Edge and Brave.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={ZIP} download className="btn-accent inline-flex items-center gap-2 px-4 py-2 text-body">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
                </svg>
                Download for Opera GX
              </a>
              <span className="text-meta text-muted">~30 KB · runs fully offline</span>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass card-lift p-5">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-line bg-surface2/70 text-accentSoft">
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </span>
              <div className="mt-3 text-body font-medium text-ink">{f.title}</div>
              <p className="mt-1 text-meta leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        <section className="glass mt-8 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted">Install in Opera GX — once</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-body text-muted">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-surface2/70 text-[11px] tnum text-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-4 rounded-card border border-line/70 bg-card/30 p-5">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted">Updating</h2>
          <p className="mt-2 text-meta leading-relaxed text-muted">
            When a new version is out (the badge above changes), download the zip
            again, replace the old folder&rsquo;s contents with the new ones, then
            hit the <span className="text-ink">↻ reload</span> arrow on the
            extension&rsquo;s card in <Code>opera://extensions</Code>. Your
            agent and settings stay.
          </p>
          <p className="mt-3 text-meta leading-relaxed text-muted">
            Private by design: everything converts on your computer — nothing
            is sent anywhere. &ldquo;Add to catalog&rdquo; just opens this site
            with the product filled in.
          </p>
        </section>

        <p className="mt-10 flex gap-5 text-meta">
          <Link href="/links" className="text-muted underline hover:text-ink">← Link hub</Link>
          <Link href="/import" className="text-muted underline hover:text-ink">Bookmarklet instead</Link>
        </p>
      </main>
    </>
  );
}
