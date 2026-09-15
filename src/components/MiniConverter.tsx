"use client";

import { useMemo, useState } from "react";
import { CURRENCIES, SYMBOL, convert, type Currency } from "@/lib/fx";
import { useRates } from "@/components/PriceHint";

// Compact three-field converter for the left rail: type in any currency, the
// other two update live. Uses the same daily-cached rates as /convert.
export function MiniConverter() {
  const rates = useRates();
  const [active, setActive] = useState<Currency>("CNY");
  const [value, setValue] = useState("");

  const amounts = useMemo(() => {
    const n = parseFloat(value);
    const out: Record<Currency, string> = { CNY: "", EUR: "", USD: "" };
    for (const c of CURRENCIES) {
      if (c === active) out[c] = value;
      else if (rates && !Number.isNaN(n))
        out[c] = String(Number(convert(n, active, c, rates).toFixed(2)));
      else out[c] = "";
    }
    return out;
  }, [value, active, rates]);

  return (
    <div className="space-y-1.5">
      {CURRENCIES.map((c) => (
        <label
          key={c}
          className={
            "flex items-center gap-2 rounded-card border px-2 py-1.5 transition-colors " +
            (active === c ? "border-accent bg-surface2" : "border-line bg-surface2/40")
          }
        >
          <span className="w-3 text-muted">{SYMBOL[c]}</span>
          <span className="w-8 text-[11px] text-muted">{c}</span>
          <input
            inputMode="decimal"
            value={amounts[c]}
            onFocus={() => setActive(c)}
            onChange={(e) => {
              setActive(c);
              setValue(e.target.value);
            }}
            placeholder="0"
            className="w-full bg-transparent text-right text-body outline-none tnum"
          />
        </label>
      ))}
    </div>
  );
}
