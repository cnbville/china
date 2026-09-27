"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { useRates } from "@/components/PriceHint";
import { useCatalog } from "@/lib/catalogStore";
import { CURRENCIES, SYMBOL, convert, type Currency } from "@/lib/fx";
import { numOnly } from "@/lib/numOnly";

// Markup checker: pick a product from the catalog, enter its raw cost, what the
// agent asked and the shipping (each in ¥, $ or €), and see the markup:
//   markup = (agent price + shipping) − raw cost
// Every check is added to a running tally, remembered in this browser until you
// press Clear. Amounts are converted to ¥ at the moment you add the check, so
// the tally doesn't drift as rates change.

type Money = { amount: string; cur: Currency };

type Check = {
  id: string;
  itemId: string;
  title: string;
  raw: Money;
  agent: Money;
  ship: Money;
  rawCny: number;
  agentCny: number;
  shipCny: number;
};

const STORE_KEY = "markup:v1";
const CUR_KEY = "markup:currencies";

type Curs = { raw: Currency; agent: Currency; ship: Currency };
const DEFAULT_CURS: Curs = { raw: "CNY", agent: "CNY", ship: "CNY" };

function num(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function markupOf(c: Pick<Check, "rawCny" | "agentCny" | "shipCny">) {
  const cny = c.agentCny + c.shipCny - c.rawCny;
  const pct = c.rawCny > 0 ? (cny / c.rawCny) * 100 : null;
  return { cny, pct };
}

export default function MarkupPage() {
  const { data } = useCatalog();
  const rates = useRates();
  const [checks, setChecks] = useState<Check[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [query, setQuery] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [agent, setAgent] = useState("");
  const [ship, setShip] = useState("");
  const [curs, setCurs] = useState<Curs>(DEFAULT_CURS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setChecks(JSON.parse(saved) as Check[]);
      const c = localStorage.getItem(CUR_KEY);
      if (c) setCurs({ ...DEFAULT_CURS, ...(JSON.parse(c) as Partial<Curs>) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(checks));
      localStorage.setItem(CUR_KEY, JSON.stringify(curs));
    } catch {
      /* storage full — non-fatal */
    }
  }, [checks, curs, loaded]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const selected = items.find((i) => i.id === itemId) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) =>
          [i.title, i.brand, i.type]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : items;
    return list.slice(0, 8);
  }, [items, query]);

  const toCny = (amount: string, cur: Currency): number | null => {
    const n = num(amount);
    if (n === null) return null;
    if (cur === "CNY") return n;
    return rates ? convert(n, cur, "CNY", rates) : null;
  };

  const rawCny = toCny(raw, curs.raw);
  const agentCny = toCny(agent, curs.agent);
  const shipCny = ship.trim() ? toCny(ship, curs.ship) : 0;
  const preview =
    rawCny !== null && agentCny !== null && shipCny !== null
      ? markupOf({ rawCny, agentCny, shipCny })
      : null;
  const canAdd = !!selected && preview !== null;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || rawCny === null || agentCny === null || shipCny === null)
      return;
    setChecks((xs) => [
      ...xs,
      {
        id: crypto.randomUUID(),
        itemId: selected.id,
        title: selected.title,
        raw: { amount: raw, cur: curs.raw },
        agent: { amount: agent, cur: curs.agent },
        ship: { amount: ship || "0", cur: curs.ship },
        rawCny,
        agentCny,
        shipCny,
      },
    ]);
    setItemId(null);
    setQuery("");
    setRaw("");
    setAgent("");
    setShip("");
  }

  function clearAll() {
    if (!confirm("Clear all checks and the tally?")) return;
    setChecks([]);
  }

  function exportCsv() {
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      "Product,Raw cost,Raw currency,Agent price,Agent currency,Shipping,Shipping currency,Raw CNY,Agent CNY,Shipping CNY,Markup CNY,Markup %",
      ...checks.map((c) => {
        const m = markupOf(c);
        return [
          cell(c.title),
          c.raw.amount,
          c.raw.cur,
          c.agent.amount,
          c.agent.cur,
          c.ship.amount,
          c.ship.cur,
          fmt(c.rawCny),
          fmt(c.agentCny),
          fmt(c.shipCny),
          fmt(m.cny),
          m.pct === null ? "" : m.pct.toFixed(2),
        ].join(",");
      }),
      [
        cell("Total"),
        "",
        "",
        "",
        "",
        "",
        "",
        fmt(totals.rawT),
        "",
        "",
        fmt(totals.mk),
        totals.pct === null ? "" : totals.pct.toFixed(2),
      ].join(","),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "markup-checks.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totals = useMemo(() => {
    const rawT = checks.reduce((s, c) => s + c.rawCny, 0);
    const paidT = checks.reduce((s, c) => s + c.agentCny + c.shipCny, 0);
    const mk = paidT - rawT;
    return { rawT, paidT, mk, pct: rawT > 0 ? (mk / rawT) * 100 : null };
  }, [checks]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
          <span className="text-meta uppercase tracking-[0.2em] text-muted">
            Tools
          </span>
        </div>
        <h1 className="font-serif text-4xl leading-tight">Markup checker</h1>
        <p className="mt-1 text-meta text-muted">
          Pick a product from your catalog, enter its raw cost, what the agent
          asked and the shipping. Markup = (agent price + shipping) − raw cost.
          Every check is added to the tally below until you clear it.
        </p>

        <form
          onSubmit={add}
          className="mt-6 space-y-4 rounded-card border border-line bg-card/70 p-4 shadow-lift sm:p-5"
        >
          {/* Product picker */}
          <div className="relative">
            <label className="mb-1 block text-meta text-muted">Product</label>
            {selected ? (
              <div className="flex items-center gap-2 rounded-card border border-accent/60 bg-surface2/70 px-3 py-2">
                <span className="truncate">{selected.title}</span>
                {selected.brand && (
                  <span className="truncate text-meta text-muted">
                    {selected.brand}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setItemId(null)}
                  className="ml-auto text-meta text-muted hover:text-ink"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  className="input"
                  placeholder={
                    data ? "Search your catalog…" : "Loading your catalog…"
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() =>
                    window.setTimeout(() => setPickerOpen(false), 150)
                  }
                />
                {pickerOpen && data && (
                  <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-line bg-card p-1 shadow-lift">
                    {matches.length === 0 ? (
                      <div className="px-3 py-2 text-meta text-muted">
                        No products match “{query}”.
                      </div>
                    ) : (
                      matches.map((i) => (
                        <button
                          key={i.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setItemId(i.id);
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-baseline gap-2 rounded-[6px] px-3 py-2 text-left hover:bg-surface2"
                        >
                          <span className="truncate">{i.title}</span>
                          <span className="truncate text-meta text-muted">
                            {[i.brand, i.type].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyInput
              label="Raw cost"
              value={raw}
              cur={curs.raw}
              onValue={setRaw}
              onCur={(c) => setCurs({ ...curs, raw: c })}
            />
            <MoneyInput
              label="Agent price"
              value={agent}
              cur={curs.agent}
              onValue={setAgent}
              onCur={(c) => setCurs({ ...curs, agent: c })}
            />
            <MoneyInput
              label="Shipping"
              value={ship}
              cur={curs.ship}
              onValue={setShip}
              onCur={(c) => setCurs({ ...curs, ship: c })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-meta tnum">
              {preview ? (
                <>
                  <span className="text-muted">Markup: </span>
                  <MarkupText cny={preview.cny} pct={preview.pct} />
                </>
              ) : (
                <span className="text-muted">
                  {!rates &&
                  [curs.raw, curs.agent, curs.ship].some((c) => c !== "CNY")
                    ? "Loading exchange rates…"
                    : "Enter the raw cost and agent price to see the markup."}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!canAdd}
              title={!selected ? "Pick a product first" : undefined}
              className="btn-accent ml-auto px-4 py-2 text-meta disabled:opacity-50"
            >
              Add to tally
            </button>
          </div>
        </form>

        {/* Tally */}
        <div className="mt-6 overflow-x-auto rounded-card border border-line bg-card/70 shadow-lift">
          <table className="w-full min-w-[640px] text-body">
            <thead className="border-b border-line text-meta text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-normal">Product</th>
                <th className="px-3 py-2 text-right font-normal">Raw cost</th>
                <th className="px-3 py-2 text-right font-normal">
                  Agent price
                </th>
                <th className="px-3 py-2 text-right font-normal">Shipping</th>
                <th className="px-3 py-2 text-right font-normal">Markup</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {checks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted">
                    No checks yet — add one above.
                  </td>
                </tr>
              )}
              {checks.map((c) => {
                const m = markupOf(c);
                return (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="px-3 py-2">
                      <Link
                        href={`/items?id=${c.itemId}`}
                        className="hover:underline"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      <Entered m={c.raw} cny={c.rawCny} />
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      <Entered m={c.agent} cny={c.agentCny} />
                    </td>
                    <td className="px-3 py-2 text-right tnum">
                      <Entered m={c.ship} cny={c.shipCny} />
                    </td>
                    <td className="px-3 py-2 text-right text-meta tnum">
                      <MarkupText cny={m.cny} pct={m.pct} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() =>
                          setChecks((xs) => xs.filter((x) => x.id !== c.id))
                        }
                        title="Remove this check"
                        className="rounded-card p-1 text-muted hover:bg-surface2 hover:text-accentSoft"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {checks.length > 0 && (
              <tfoot className="border-t border-line">
                <tr>
                  <td className="px-3 py-3 font-medium">
                    Total · {checks.length} check
                    {checks.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-3 text-right tnum">
                    ¥{fmt(totals.rawT)}
                  </td>
                  <td
                    colSpan={2}
                    className="px-3 py-3 text-right text-meta text-muted tnum"
                  >
                    paid ¥{fmt(totals.paidT)}
                  </td>
                  <td className="px-3 py-3 text-right text-meta tnum">
                    <MarkupText cny={totals.mk} pct={totals.pct} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-meta text-muted">
          <span>Saved in this browser until you clear it.</span>
          <span className="flex gap-4">
            <button
              onClick={exportCsv}
              disabled={checks.length === 0}
              className="underline hover:text-ink disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              onClick={clearAll}
              disabled={checks.length === 0}
              className="underline hover:text-ink disabled:opacity-50"
            >
              Clear
            </button>
          </span>
        </div>

        <p className="mt-10 text-meta">
          <Link href="/" className="text-muted underline hover:text-ink">
            ← Home
          </Link>
        </p>
      </main>
    </>
  );
}

function MoneyInput({
  label,
  value,
  cur,
  onValue,
  onCur,
}: {
  label: string;
  value: string;
  cur: Currency;
  onValue: (v: string) => void;
  onCur: (c: Currency) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-meta text-muted">{label}</span>
      <div className="flex gap-1.5">
        <input
          className="input tnum"
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onValue(numOnly(e.target.value))}
        />
        <select
          value={cur}
          onChange={(e) => onCur(e.target.value as Currency)}
          aria-label={`${label} currency`}
          className="input w-auto shrink-0 px-2"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {SYMBOL[c]} {c}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

// What was typed, plus its ¥ value when it wasn't entered in ¥.
function Entered({ m, cny }: { m: Money; cny: number }) {
  return (
    <>
      {SYMBOL[m.cur]}
      {m.amount}
      {m.cur !== "CNY" && (
        <span className="block text-[11px] text-muted">≈ ¥{fmt(cny)}</span>
      )}
    </>
  );
}

function MarkupText({ cny, pct }: { cny: number; pct: number | null }) {
  const color =
    cny > 0.005
      ? "text-accentSoft"
      : cny < -0.005
        ? "text-emerald-400"
        : "text-muted";
  return (
    <span className={color}>
      {cny >= 0 ? "+" : "−"}¥{fmt(Math.abs(cny))}
      {pct !== null && ` (${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}
