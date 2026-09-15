"use client";

import { useEffect, useState } from "react";
import { convert, getRates, type Rates } from "@/lib/fx";

// Shared, cached rates for the whole session. getRates() de-dupes the fetch and
// serves from the daily localStorage cache.
export function useRates(): Rates | null {
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    let alive = true;
    getRates()
      .then((d) => alive && setRates(d.rates))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return rates;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1);
}

// A muted "≈ €x · $y" hint shown beside a CNY price. Renders nothing until the
// daily rates are available (so it never flashes wrong numbers).
export function PriceHint({
  cny,
  className = "",
}: {
  cny: number | null;
  className?: string;
}) {
  const rates = useRates();
  if (cny == null || !rates) return null;
  const eur = convert(cny, "CNY", "EUR", rates);
  const usd = convert(cny, "CNY", "USD", rates);
  return (
    <span className={"text-muted tnum " + className}>
      ≈ €{fmt(eur)} · ${fmt(usd)}
    </span>
  );
}
