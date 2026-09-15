"use client";

import { useLiveData } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { useRates } from "@/components/PriceHint";
import { MiniConverter } from "@/components/MiniConverter";
import { convert } from "@/lib/fx";

// Right rail: an at-a-glance pulse of the catalog + today's rates.
type Stats = {
  items: number;
  links: number;
  wanted: number;
  cheapest: number | null;
};

export function RightRail() {
  const { data } = useLiveData<Stats>(async () => {
    const supabase = createClient();
    const [cardsRes, linksRes] = await Promise.all([
      supabase.from("item_cards").select("wanted, lead_price"),
      supabase.from("sources").select("id", { count: "exact", head: true }),
    ]);
    if (cardsRes.error) throw cardsRes.error;

    const rows = (cardsRes.data ?? []) as {
      wanted: boolean;
      lead_price: number | null;
    }[];
    const prices = rows
      .map((r) => r.lead_price)
      .filter((p): p is number => p != null);

    return {
      items: rows.length,
      links: linksRes.count ?? 0,
      wanted: rows.filter((r) => r.wanted).length,
      cheapest: prices.length ? Math.min(...prices) : null,
    };
  });

  const rates = useRates();

  return (
    <div className="sticky top-20 space-y-6">
      <section>
        <RailLabel>Catalog</RailLabel>
        <div className="grid grid-cols-2 gap-2">
          <Stat n={data?.items} label="items" />
          <Stat n={data?.links} label="links" />
          <Stat
            n={data?.cheapest != null ? `¥${fmt(data.cheapest)}` : "—"}
            label="cheapest"
            accent
          />
          <Stat n={data?.wanted} label="wanted" />
        </div>
      </section>

      <section>
        <RailLabel>Convert</RailLabel>
        <MiniConverter />
      </section>

      <section>
        <RailLabel>Today’s rates</RailLabel>
        <div className="rounded-card border border-line bg-card/60 p-3 text-meta tnum">
          {rates ? (
            <>
              <Row
                k="¥1 CNY"
                v={`€${fmt(convert(1, "CNY", "EUR", rates), 3)} · $${fmt(convert(1, "CNY", "USD", rates), 3)}`}
              />
              <Row
                k="€1 EUR"
                v={`¥${fmt(convert(1, "EUR", "CNY", rates))} · $${fmt(convert(1, "EUR", "USD", rates))}`}
              />
              <Row
                k="$1 USD"
                v={`¥${fmt(convert(1, "USD", "CNY", rates))} · €${fmt(convert(1, "USD", "EUR", rates))}`}
              />
            </>
          ) : (
            <p className="text-muted">Loading…</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  n,
  label,
  accent,
}: {
  n: number | string | undefined;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-card/60 p-3">
      <div
        className={
          "font-serif text-3xl leading-none " + (accent ? "text-accentSoft" : "")
        }
      >
        {n ?? "—"}
      </div>
      <div className="mt-1 text-meta text-muted">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-3 w-1 rounded-pill bg-accent shadow-glow" />
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
        {children}
      </span>
    </div>
  );
}

function fmt(n: number, dp = 2): string {
  const r = Number(n.toFixed(dp));
  return String(r);
}
