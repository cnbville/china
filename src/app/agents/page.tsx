"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getRates, type FxData } from "@/lib/fx";
import { createClient } from "@/lib/supabase/client";
import { fetchAgents, num, syncAgents, toRow, type Agent } from "@/lib/agents";

// Shipping-agent ranking. Saved to Supabase (shipping_agents), with a copy in
// localStorage so the table still opens offline or before the first sync.
//
// Rates are entered as what the agent charges for ¥1000 in $ / €, WITHOUT the
// processing fee, so the rate columns show the pure FX upcharge vs. market.
// The processing fee % is its own column; ranking and the baseline comparison
// use the all-in price (rate + processing fee). The cheapest-payment column is
// kept for reference only.

type SortKey =
  | "rank"
  | "name"
  | "usd"
  | "eur"
  | "proc"
  | "ship"
  | "fee"
  | "base"
  | "order";

const CNY_AMOUNT = 1000;
const STORE_KEY = "agents:v2";
const OLD_KEY = "agents:v1"; // stored ¥ per $1 / €1
const BASE_KEY = "agents:baseline";
const AMOUNT_KEY = "agents:amount"; // ¥ amount for the "Your order" column

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

// Pure FX upcharge: % the agent's rate is above market (no processing fee).
function upcharge(agentPrice: string, market: number | undefined) {
  const p = num(agentPrice);
  if (p === null || !market) return null;
  return (p / market - 1) * 100;
}

// All-in price for ¥1000: the agent's rate plus the processing fee.
function allIn(price: string, proc: string | undefined): number | null {
  const p = num(price);
  if (p === null) return null;
  return p * (1 + (num(proc ?? "") ?? 0) / 100);
}

// % above market / above baseline for an all-in price.
function rel(x: number | null, ref: number | null | undefined): number | null {
  if (x === null || !ref) return null;
  return (x / ref - 1) * 100;
}

const minOf = (...xs: (number | null)[]) => {
  const ns = xs.filter((x): x is number => x !== null);
  return ns.length ? Math.min(...ns) : null;
};

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
  const [baseId, setBaseId] = useState<string | null>(null);
  const [amount, setAmount] = useState("1000");
  // Cloud sync: null until the first Supabase load settles.
  const [sync, setSync] = useState<
    "loading" | "saving" | "saved" | { error: string }
  >("loading");
  const synced = useRef<Map<string, string> | null>(null);
  const [draft, setDraft] = useState<Omit<Agent, "id">>({
    name: "",
    usd: "",
    eur: "",
    proc: "",
    ship: "",
    fee: "",
  });

  useEffect(() => {
    const local = load();
    let localBase: string | null = null;
    try {
      localBase = localStorage.getItem(BASE_KEY);
    } catch {
      /* ignore */
    }
    setAgents(local);
    setBaseId(localBase);
    try {
      const amt = localStorage.getItem(AMOUNT_KEY);
      if (amt) setAmount(amt);
    } catch {
      /* ignore */
    }
    setLoaded(true);
    getRates().then(setFx);

    // Supabase is the source of truth. If it's empty but this browser has
    // agents from before cloud sync, upload them (the debounced sync below
    // does that once `synced` is an empty map).
    const supabase = createClient();
    fetchAgents(supabase)
      .then((remote) => {
        if (remote.agents.length > 0 || local.length === 0) {
          setAgents(remote.agents);
          setBaseId(remote.baseId);
          synced.current = new Map(
            remote.agents.map((a) => [
              a.id,
              JSON.stringify(toRow(a, remote.baseId)),
            ]),
          );
          setSync("saved");
        } else {
          synced.current = new Map();
          setSync("saving");
        }
      })
      .catch((e: { message?: string }) =>
        setSync({ error: e?.message ?? "Couldn't reach Supabase" }),
      );
  }, []);

  // Push edits to Supabase, debounced so typing doesn't fire a write per key.
  useEffect(() => {
    if (!synced.current) return;
    const rows = agents.map((a) => toRow(a, baseId));
    const t = setTimeout(async () => {
      if (!synced.current) return;
      setSync("saving");
      try {
        synced.current = await syncAgents(createClient(), rows, synced.current);
        setSync("saved");
      } catch (e) {
        setSync({
          error: (e as { message?: string })?.message ?? "Save failed",
        });
      }
    }, 700);
    return () => clearTimeout(t);
    // `sync` is included so the first upload runs once loading settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, baseId, sync === "loading"]);

  // Save on every change (after the initial load, so we never wipe the store).
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(agents));
    } catch {
      /* storage full — non-fatal */
    }
  }, [agents, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (baseId) localStorage.setItem(BASE_KEY, baseId);
      else localStorage.removeItem(BASE_KEY);
    } catch {
      /* ignore */
    }
  }, [baseId, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(AMOUNT_KEY, amount);
    } catch {
      /* ignore */
    }
  }, [amount, loaded]);

  // Market price of ¥1000 in $ and € (fx rates are EUR = 1).
  const mUsd = fx ? (CNY_AMOUNT * fx.rates.USD) / fx.rates.CNY : undefined;
  const mEur = fx ? CNY_AMOUNT / fx.rates.CNY : undefined;

  const baseline = agents.find((a) => a.id === baseId) ?? null;

  const rows = useMemo(() => {
    const bUsd = baseline ? allIn(baseline.usd, baseline.proc) : null;
    const bEur = baseline ? allIn(baseline.eur, baseline.proc) : null;
    const withCost = agents.map((a) => {
      const cUsd = upcharge(a.usd, mUsd);
      const cEur = upcharge(a.eur, mEur);
      const aUsd = allIn(a.usd, a.proc);
      const aEur = allIn(a.eur, a.proc);
      // All-in % above market — what the ranking uses.
      const tUsd = rel(aUsd, mUsd);
      const tEur = rel(aEur, mEur);
      const best = minOf(tUsd, tEur);
      const dUsd = rel(aUsd, bUsd);
      const dEur = rel(aEur, bEur);
      const dBest = minOf(dUsd, dEur);
      // Price for the ¥ amount in the "Your order" column (all-in), and the
      // same with the agent's domestic shipping added to the ¥ amount.
      const amt = num(amount);
      const ship = num(a.ship) ?? 0;
      const scale = (per1000: number | null, cny: number) =>
        per1000 === null || amt === null ? null : (per1000 * cny) / CNY_AMOUNT;
      const oUsd = scale(aUsd, amt ?? 0);
      const oEur = scale(aEur, amt ?? 0);
      const sUsd = ship ? scale(aUsd, (amt ?? 0) + ship) : null;
      const sEur = ship ? scale(aEur, (amt ?? 0) + ship) : null;
      const oSort = sUsd ?? oUsd ?? sEur ?? oEur;
      return {
        a,
        cUsd,
        cEur,
        aUsd,
        aEur,
        tUsd,
        tEur,
        best,
        dUsd,
        dEur,
        dBest,
        oUsd,
        oEur,
        sUsd,
        sEur,
        oSort,
      };
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
        case "proc":
          return nullLast(num(x.a.proc ?? "")) - nullLast(num(y.a.proc ?? ""));
        case "ship":
          return nullLast(num(x.a.ship ?? "")) - nullLast(num(y.a.ship ?? ""));
        case "fee":
          return nullLast(num(x.a.fee)) - nullLast(num(y.a.fee));
        case "base":
          return nullLast(x.dBest) - nullLast(y.dBest);
        case "order":
          return nullLast(x.oSort) - nullLast(y.oSort);
        default:
          return rankOf.get(x.a.id)! - rankOf.get(y.a.id)!;
      }
    });
    return sorted.map((r) => ({ ...r, rank: rankOf.get(r.a.id)! }));
  }, [agents, mUsd, mEur, sort, baseline, amount]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    setAgents((xs) => [
      ...xs,
      { id: crypto.randomUUID(), ...draft, name: draft.name.trim() },
    ]);
    setDraft({ name: "", usd: "", eur: "", proc: "", ship: "", fee: "" });
  }

  function update(id: string, patch: Partial<Agent>) {
    setAgents((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete ${name || "this agent"}?`)) return;
    setAgents((xs) => xs.filter((a) => a.id !== id));
    if (id === baseId) setBaseId(null);
  }

  async function refresh() {
    setRefreshing(true);
    setFx(await getRates(true));
    setRefreshing(false);
  }

  function exportCsv() {
    const lines = [
      "Name,USD for 1000 CNY,EUR for 1000 CNY,Processing fee %,Domestic shipping CNY,Cheapest payment %,Market USD for 1000 CNY,Market EUR for 1000 CNY,Upcharge USD %,Upcharge EUR %,All-in USD,All-in EUR,All-in vs market USD %,All-in vs market EUR %,vs baseline USD %,vs baseline EUR %",
      ...rows.map(({ a, cUsd, cEur, aUsd, aEur, tUsd, tEur, dUsd, dEur }) =>
        [
          `"${a.name.replace(/"/g, '""')}"`,
          a.usd,
          a.eur,
          a.proc ?? "",
          a.ship ?? "",
          a.fee,
          mUsd?.toFixed(2) ?? "",
          mEur?.toFixed(2) ?? "",
          cUsd?.toFixed(2) ?? "",
          cEur?.toFixed(2) ?? "",
          aUsd?.toFixed(2) ?? "",
          aEur?.toFixed(2) ?? "",
          tUsd?.toFixed(2) ?? "",
          tEur?.toFixed(2) ?? "",
          dUsd?.toFixed(2) ?? "",
          dEur?.toFixed(2) ?? "",
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
      <main className="mx-auto max-w-[1600px] px-4 pb-16 pt-8">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-3 w-1.5 rounded-pill bg-accent shadow-glow" />
          <span className="text-meta uppercase tracking-[0.2em] text-muted">
            Tools
          </span>
        </div>
        <h1 className="font-serif text-4xl leading-tight">Shipping agents</h1>
        <p className="mt-1 text-meta text-muted">
          Enter what each agent charges for ¥1000 in $ and € (before processing
          fees), their processing fee %, domestic shipping cost (¥), and their
          cheapest payment fee for reference. Ranked by all-in cost (rate +
          processing fee) vs. the market rate — lower is better. Saved to
          Supabase, so it&apos;s on all your devices.
        </p>

        <form
          onSubmit={add}
          className="mt-6 grid grid-cols-2 gap-2 rounded-card border border-line bg-card/70 p-4 shadow-lift sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]"
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
            placeholder="Processing %"
            value={draft.proc}
            onChange={(e) => setDraft({ ...draft, proc: e.target.value })}
          />
          <input
            className="input tnum"
            inputMode="decimal"
            placeholder="Domestic ship ¥"
            value={draft.ship}
            onChange={(e) => setDraft({ ...draft, ship: e.target.value })}
          />
          <input
            className="input tnum"
            inputMode="decimal"
            placeholder="Cheapest pay %"
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
          <table className="w-full min-w-[1000px] text-body">
            <thead className="border-b border-line text-meta text-muted">
              <tr>
                {th("rank", "#")}
                {th("name", "Name")}
                {th("usd", "→ USD", "$ for ¥1000 · upcharge")}
                {th("eur", "→ EUR", "€ for ¥1000 · upcharge")}
                {th("proc", "Processing fee", "% · all-in price")}
                {th("ship", "Domestic shipping", "¥ in China")}
                {th("fee", "Cheapest payment", "fee %")}
                <th className="px-2 py-2 text-left font-normal">
                  Market rate
                  <span className="block text-[11px]">live</span>
                </th>
                {th(
                  "base",
                  "vs baseline",
                  baseline ? `vs ${baseline.name || "baseline"}` : "pick a ☆",
                )}
                <th className="px-2 py-2 text-left font-normal">
                  ¥ amount
                  <label className="mt-0.5 flex items-center gap-1 text-[11px]">
                    ¥
                    <input
                      value={amount}
                      inputMode="decimal"
                      onChange={(e) => setAmount(e.target.value)}
                      title="Change the ¥ amount — every agent's price updates"
                      className="w-20 rounded-[6px] border border-line bg-surface2 px-1.5 py-0.5 text-ink outline-none tnum focus:border-accent"
                    />
                  </label>
                </th>
                <th className="px-2 py-2 text-left font-normal">
                  <button
                    onClick={() => setSort("order")}
                    className={
                      "text-left hover:text-ink " +
                      (sort === "order" ? "text-ink" : "")
                    }
                  >
                    Your order{sort === "order" && " ↓"}
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-muted">
                    No agents yet — add one above.
                  </td>
                </tr>
              )}
              {rows.map(
                ({
                  a,
                  cUsd,
                  cEur,
                  aUsd,
                  aEur,
                  tUsd,
                  tEur,
                  rank,
                  dUsd,
                  dEur,
                  oUsd,
                  oEur,
                }) => (
                  <tr
                    key={a.id}
                    className={
                      "border-b border-line/60 last:border-0 hover:bg-surface2/40 " +
                      (a.id === baseId ? "bg-surface2/60" : "")
                    }
                  >
                    <td className="px-2 py-1.5 text-muted tnum">
                      <span
                        className={
                          rank === 1 && (tUsd !== null || tEur !== null)
                            ? "font-semibold text-accentSoft"
                            : ""
                        }
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            setBaseId(a.id === baseId ? null : a.id)
                          }
                          title={
                            a.id === baseId
                              ? "Baseline — click to clear"
                              : "Use as baseline"
                          }
                          className={
                            "shrink-0 text-lg leading-none " +
                            (a.id === baseId
                              ? "text-amber-400"
                              : "text-muted/60 hover:text-amber-400")
                          }
                        >
                          {a.id === baseId ? "★" : "☆"}
                        </button>
                        <Cell
                          value={a.name}
                          onChange={(v) => update(a.id, { name: v })}
                        />
                      </div>
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
                          value={a.proc ?? ""}
                          numeric
                          onChange={(v) => update(a.id, { proc: v })}
                        />
                        <span className="text-muted">%</span>
                      </div>
                      <div
                        className="px-1.5 text-[11px] text-muted tnum"
                        title="All-in price for ¥1000 and % above market"
                      >
                        {aUsd !== null && `$${aUsd.toFixed(2)} (${pct(tUsd)})`}
                        {aUsd !== null && aEur !== null && <br />}
                        {aEur !== null && `€${aEur.toFixed(2)} (${pct(tEur)})`}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-muted">¥</span>
                        <Cell
                          value={a.ship ?? ""}
                          numeric
                          onChange={(v) => update(a.id, { ship: v })}
                        />
                      </div>
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
                    <td className="px-2 py-1.5 text-meta tnum">
                      {!baseline ? (
                        <span className="text-muted">—</span>
                      ) : a.id === baseId ? (
                        <span className="text-amber-400">baseline</span>
                      ) : (
                        <>
                          <Diff label="$" d={dUsd} />
                          <br />
                          <Diff label="€" d={dEur} />
                        </>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-meta text-muted tnum">
                      {num(amount) === null ? "—" : `¥${amount}`}
                    </td>
                    <td className="px-2 py-1.5 text-meta tnum">
                      {oUsd === null && oEur === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          <div>
                            {[
                              oUsd !== null && `$${oUsd.toFixed(2)}`,
                              oEur !== null && `€${oEur.toFixed(2)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </>
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
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-meta text-muted">
          <span>
            {fx
              ? `Market: ${fx.source} · ${fx.stale ? "offline" : "as of " + fx.date}`
              : "Loading rates…"}
            {" · "}
            {sync === "loading" ? (
              "Loading from Supabase…"
            ) : sync === "saving" ? (
              "Saving…"
            ) : sync === "saved" ? (
              <span className="text-emerald-400">Saved to Supabase</span>
            ) : (
              <span className="text-accentSoft" title={sync.error}>
                Not synced — only saved in this browser ({sync.error})
              </span>
            )}
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
          Upcharge (next to each rate) = how much worse the agent&apos;s rate is
          than market, before processing fees. All-in (under the processing fee)
          = rate + processing fee, and is what the ranking uses. Tap ☆ to make
          an agent the baseline — every other agent then shows how much cheaper
          (green, −) or pricier (red, +) it is all-in. Click a column header to
          sort; click any cell to edit. Your order = what the ¥ amount in that
          column header costs with each agent (all-in), and underneath the same
          with their domestic shipping added.
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

// Negative = cheaper than the baseline (good), positive = pricier.
function Diff({ label, d }: { label: string; d: number | null }) {
  return (
    <span
      className={
        d === null
          ? "text-muted"
          : d < -0.005
            ? "text-emerald-400"
            : d > 0.005
              ? "text-accentSoft"
              : "text-muted"
      }
    >
      {label} {pct(d)}
    </span>
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
        title="FX upcharge vs. market (before processing fees)"
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
