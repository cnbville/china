"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getRates, type FxData } from "@/lib/fx";

// Shipping-agent ranking. Kept entirely in this browser (localStorage) — no
// Supabase — so it's a quick scratch table you can fill in and come back to.
//
// Rates are entered as what the agent charges for ¥1000 in $ / €. Compared
// against the live market rate, that gives the hidden FX markup; add the
// cheapest payment method's fee and you get the real total cost.

type Agent = {
  id: string;
  name: string;
  usd: string; // $ the agent charges for ¥1000
  eur: string; // € the agent charges for ¥1000
  fee: string; // cheapest payment fee, %
};

type SortKey = "rank" | "name" | "usd" | "eur" | "fee";

const CNY_AMOUNT = 1000;
const STORE_KEY = "agents:v2";
const OLD_KEY = "agents:v1"; // stored ¥ per $1 / €1

function load(): Agent[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Agent[];
    // Migrate v1 (¥ per $1) to v2 ($ per ¥1000).
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const flip = (v: string) => {
        const n = num(v);
        return n ? String(Number((CNY_AMOUNT / n).toFixed(2))) : v;
      };
      return (JSON.parse(old) as Agent[]).map((a) => ({
        ...a,
        usd: flip(a.usd),
        eur: flip(a.eur),
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function num(s: string): number | null {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Total % extra paid vs. the market rate with no fee.
function totalCost(agentPrice: string, market: number | undefined, fee: string) {
  const p = num(agentPrice);
  if (p === null || !market) return null;
  const markup = (p / market - 1) * 100;
  return markup + (num(fee) ?? 0);
}

function pct(n: number | null): string {
  if (n === null) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fx, setFx] = useState<FxData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>("rank");
  const [draft, setDraft] = useState<Omit<Agent, "id">>({
    name: "",
    usd: "",
    eur: "",
    fee: "",
  });

  useEffect(() => {
    setAgents(load());
    setLoaded(true);
    getRates().then(setFx);
  }, []);

  // Save on every change (after the initial load, so we never wipe the store).
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(agents));
    } catch {
      /* storage full — non-fatal */
    }
  }, [agents, loaded]);

  // Market price of ¥1000 in $ and € (fx rates are EUR = 1).
  const mUsd = fx ? (CNY_AMOUNT * fx.rates.USD) / fx.rates.CNY : undefined;
  const mEur = fx ? CNY_AMOUNT / fx.rates.CNY : undefined;

  const rows = useMemo(() => {
    const withCost = agents.map((a) => {
      const cUsd = totalCost(a.usd, mUsd, a.fee);
      const cEur = totalCost(a.eur, mEur, a.fee);
      const both = [cUsd, cEur].filter((c): c is number => c !== null);
      const best = both.length ? Math.min(...both) : null;
      return { a, cUsd, cEur, best };
    });
    const nullLast = (x: number | null) => (x === null ? Infinity : x);
    const ranked = [...withCost].sort(
      (x, y) => nullLast(x.best) - nullLast(y.best),
    );
    const rankOf = new Map(ranked.map((r, i) => [r.a.id, i + 1]));
    const sorted = [...withCost].sort((x, y) => {
      switch (sort) {
        case "name":
          return x.a.name.localeCompare(y.a.name);
        case "usd":
          return nullLast(x.cUsd) - nullLast(y.cUsd);
        case "eur":
          return nullLast(x.cEur) - nullLast(y.cEur);
        case "fee":
          return nullLast(num(x.a.fee)) - nullLast(num(y.a.fee));
        default:
          return rankOf.get(x.a.id)! - rankOf.get(y.a.id)!;
      }
    });
    return sorted.map((r) => ({ ...r, rank: rankOf.get(r.a.id)! }));
  }, [agents, mUsd, mEur, sort]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setAgents((xs) => [
      ...xs,
      { id: crypto.randomUUID(), ...draft, name: draft.name.trim() },
    ]);
    setDraft({ name: "", usd: "", eur: "", fee: "" });
  }

  function update(id: string, patch: Partial<Agent>) {
    setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete ${name || "this agent"}?`)) return;
    setAgents((xs) => xs.filter((a) => a.id !== id));
  }

  async function refresh() {
    setRefreshing(true);
    setFx(await getRates(true));
    setRefreshing(false);
  }

  function exportCsv() {
    const lines = [
      "Name,USD for 1000 CNY,EUR for 1000 CNY,Cheapest payment %,Market USD for 1000 CNY,Market EUR for 1000 CNY,Total cost USD %,Total cost EUR %",
      ...rows.map(({ a, cUsd, cEur }) =>
        [
          `"${a.name.replace(/"/g, '""')}"`,
          a.usd,
          a.eur,
          a.fee,
          mUsd?.toFixed(2) ?? "",
          mEur?.toFixed(2) ?? "",
          cUsd?.toFixed(2) ?? "",
          cEur?.toFixed(2) ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shipping-agents.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const th = (key: SortKey, label: string, hint?: string) => (
    <th className="px-2 py-2 text-left font-normal">
      <button
        onClick={() => setSort(key)}
        className={
          "text-left hover:text-ink " + (sort === key ? "text-ink" : "")
        }
      >
        {label}
        {sort === key && " ↓"}
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </button>
    </th>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
          <span className="text-meta uppercase tracking-[0.2em] text-muted">
            Tools
          </span>
        </div>
        <h1 className="font-serif text-4xl leading-tight">Shipping agents</h1>
        <p className="mt-1 text-meta text-muted">
          Enter what each agent charges for ¥1000 in $ and €, and their
          cheapest payment fee. Ranked by total cost vs. the market rate — lower
          is better. Saved in this browser only.
        </p>

        <form
          onSubmit={add}
          className="mt-6 grid grid-cols-2 gap-2 rounded-card border border-line bg-card/70 p-4 shadow-lift sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        >
          <input
            className="input col-span-2 sm:col-span-1"
            placeholder="Agent name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className="input tnum"
            inputMode="decimal"
            placeholder={`$ for ¥1000${mUsd ? ` (mkt ${mUsd.toFixed(2)})` : ""}`}
            value={draft.usd}
            onChange={(e) => setDraft({ ...draft, usd: e.target.value })}
          />
          <input
            className="input tnum"
            inputMode="decimal"
            placeholder={`€ for ¥1000${mEur ? ` (mkt ${mEur.toFixed(2)})` : ""}`}
            value={draft.eur}
            onChange={(e) => setDraft({ ...draft, eur: e.target.value })}
          />
          <input
            className="input tnum"
            inputMode="decimal"
            placeholder="Fee %"
            value={draft.fee}
            onChange={(e) => setDraft({ ...draft, fee: e.target.value })}
          />
          <button
            type="submit"
            className="btn-accent px-4 py-2 text-meta disabled:opacity-50"
            disabled={!draft.name.trim()}
          >
            Add
          </button>
        </form>

        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-card/70 shadow-lift">
          <table className="w-full min-w-[760px] text-body">
            <thead className="border-b border-line text-meta text-muted">
              <tr>
                {th("rank", "#")}
                {th("name", "Name")}
                {th("usd", "→ USD", "$ for ¥1000 · total cost")}
                {th("eur", "→ EUR", "€ for ¥1000 · total cost")}
                {th("fee", "Cheapest payment", "fee %")}
                <th className="px-2 py-2 text-left font-normal">
                  Market rate
                  <span className="block text-[11px]">live</span>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    No agents yet — add one above.
                  </td>
                </tr>
              )}
              {rows.map(({ a, cUsd, cEur, rank }) => (
                <tr
                  key={a.id}
                  className="border-b border-line/60 last:border-0 hover:bg-surface2/40"
                >
                  <td className="px-2 py-1.5 text-muted tnum">
                    <span
                      className={
                        rank === 1 && (cUsd !== null || cEur !== null)
                          ? "font-semibold text-accentSoft"
                          : ""
                      }
                    >
                      {rank}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Cell
                      value={a.name}
                      onChange={(v) => update(a.id, { name: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <RateCell
                      symbol="$"
                      value={a.usd}
                      cost={cUsd}
                      onChange={(v) => update(a.id, { usd: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <RateCell
                      symbol="€"
                      value={a.eur}
                      cost={cEur}
                      onChange={(v) => update(a.id, { eur: v })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <Cell
                        value={a.fee}
                        numeric
                        onChange={(v) => update(a.id, { fee: v })}
                      />
                      <span className="text-muted">%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-meta text-muted tnum">
                    {mUsd && mEur ? (
                      <>
                        ¥1000 = ${mUsd.toFixed(2)}
                        <br />
                        ¥1000 = €{mEur.toFixed(2)}
                      </>
                    ) : (
                      "loading…"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => remove(a.id, a.name)}
                      title="Delete"
                      className="rounded-card p-1 text-muted hover:bg-surface2 hover:text-accentSoft"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-meta text-muted">
          <span>
            {fx
              ? `Market: ${fx.source} · ${fx.stale ? "offline" : "as of " + fx.date}`
              : "Loading rates…"}
          </span>
          <span className="flex gap-4">
            <button
              onClick={refresh}
              disabled={refreshing}
              className="underline hover:text-ink disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh rates"}
            </button>
            <button
              onClick={exportCsv}
              disabled={!agents.length}
              className="underline hover:text-ink disabled:opacity-50"
            >
              Export CSV
            </button>
          </span>
        </div>
        <p className="mt-2 text-meta text-muted">
          Total cost = how much more the agent charges than market, plus
          the payment fee. Click a column header to sort; click any cell to
          edit.
        </p>

        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}

function Cell({
  value,
  onChange,
  numeric,
}: {
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <input
      value={value}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className={
        "w-full min-w-0 rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 outline-none hover:border-line focus:border-accent focus:bg-surface2 " +
        (numeric ? "tnum" : "")
      }
    />
  );
}

function RateCell({
  symbol,
  value,
  cost,
  onChange,
}: {
  symbol: string;
  value: string;
  cost: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{symbol}</span>
      <Cell value={value} numeric onChange={onChange} />
      <span
        title="Total cost vs. market (rate markup + fee)"
        className={
          "shrink-0 text-meta tnum " +
          (cost === null
            ? "text-muted"
            : cost <= 1
              ? "text-emerald-400"
              : cost <= 3
                ? "text-amber-400"
                : "text-accentSoft")
        }
      >
        {pct(cost)}
      </span>
    </div>
  );
}
