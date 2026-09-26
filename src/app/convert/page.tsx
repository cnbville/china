"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { LinkConverter } from "@/components/LinkConverter";
import {
  CURRENCIES,
  SYMBOL,
  convert,
  getRates,
  type Currency,
  type FxData,
} from "@/lib/fx";

export default function ConvertPage() {
  const [fx, setFx] = useState<FxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Which field the user is typing in, and its raw value.
  const [active, setActive] = useState<Currency>("CNY");
  const [value, setValue] = useState("100");

  async function load(force = false) {
    if (force) setRefreshing(true);
    const data = await getRates(force);
    setFx(data);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load(false);
  }, []);

  const amounts = useMemo(() => {
    const n = parseFloat(value);
    const out: Record<Currency, string> = { CNY: "", EUR: "", USD: "" };
    for (const c of CURRENCIES) {
      if (c === active) {
        out[c] = value;
      } else if (fx && !Number.isNaN(n)) {
        out[c] = round(convert(n, active, c, fx.rates));
      } else {
        out[c] = "";
      }
    }
    return out;
  }, [value, active, fx]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-4 py-8">
        {/* Link converter — the primary tool */}
        <LinkConverter />

        {/* Currency */}
        <section className="mt-12">
          <h2 className="font-serif text-2xl">Currency</h2>
          <div className="mt-4 space-y-3 rounded-card border border-line bg-card/70 p-5 shadow-lift">
            {CURRENCIES.map((c) => (
              <label
                key={c}
                className={
                  "flex items-center gap-3 rounded-card border px-3 py-2.5 transition-colors " +
                  (active === c
                    ? "border-accent bg-surface2"
                    : "border-line bg-surface2/40")
                }
              >
                <span className="w-6 text-lg text-muted tnum">{SYMBOL[c]}</span>
                <span className="w-10 text-meta text-muted">{c}</span>
                <input
                  inputMode="decimal"
                  value={amounts[c]}
                  onFocus={() => setActive(c)}
                  onChange={(e) => {
                    setActive(c);
                    setValue(e.target.value);
                  }}
                  placeholder="0"
                  className="w-full bg-transparent text-right text-xl outline-none tnum"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-meta text-muted">
            <span>
              {loading
                ? "Loading rates…"
                : fx
                  ? `${fx.source} · ${fx.stale ? "offline" : "as of " + fx.date}`
                  : ""}
            </span>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="text-muted underline hover:text-ink disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <p className="mt-2 text-meta text-muted">
            Rates refresh automatically once a day. Prices in your catalog stay in
            CNY — this is just a quick reference.
          </p>
        </section>

        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}

// Trim to a sensible number of decimals without trailing zeros.
function round(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(2)));
}
