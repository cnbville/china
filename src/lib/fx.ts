// Currency rates for the in-app converter (CNY / EUR / USD).
//
// The app is static (no server), so rates are fetched from a free, no-key source
// in the browser and cached in localStorage. We only refetch when the cache is
// older than ~22h, so it effectively refreshes once a day (ECB publishes rates
// once per working day anyway). Everything is expressed relative to EUR = 1.

export type Rates = { EUR: number; USD: number; CNY: number };
export type FxData = {
  rates: Rates;
  date: string; // the rate date reported by the source (YYYY-MM-DD)
  source: string;
  fetchedAt: number; // ms epoch when we fetched
  stale?: boolean; // true when served from an old cache / fallback
};

export const CURRENCIES = ["CNY", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const SYMBOL: Record<Currency, string> = { CNY: "¥", EUR: "€", USD: "$" };

const CACHE_KEY = "fx:v1";
const MAX_AGE_MS = 22 * 60 * 60 * 1000; // ~once a day

// Last-resort offline fallback so the tool is never dead. Clearly flagged stale.
const FALLBACK: FxData = {
  rates: { EUR: 1, USD: 1.08, CNY: 7.7 },
  date: "approx",
  source: "offline estimate",
  fetchedAt: 0,
  stale: true,
};

function readCache(): FxData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as FxData;
    if (data?.rates?.CNY && data?.rates?.USD) return data;
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchJson(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Primary: Frankfurter (ECB data, no key, CORS-enabled).
async function fromFrankfurter(): Promise<FxData> {
  const j = (await fetchJson(
    "https://api.frankfurter.app/latest?from=EUR&to=USD,CNY",
  )) as { date: string; rates: { USD: number; CNY: number } };
  return {
    rates: { EUR: 1, USD: j.rates.USD, CNY: j.rates.CNY },
    date: j.date,
    source: "ECB via Frankfurter",
    fetchedAt: Date.now(),
  };
}

// Fallback source with a different shape.
async function fromErApi(): Promise<FxData> {
  const j = (await fetchJson("https://open.er-api.com/v6/latest/EUR")) as {
    rates: { USD: number; CNY: number };
    time_last_update_utc?: string;
  };
  return {
    rates: { EUR: 1, USD: j.rates.USD, CNY: j.rates.CNY },
    date: (j.time_last_update_utc ?? "").slice(0, 16) || "latest",
    source: "open.er-api.com",
    fetchedAt: Date.now(),
  };
}

/**
 * Return today's rates. Uses the cache when it's fresh; otherwise fetches (with
 * a fallback source), and falls back to a stale cache / offline estimate if the
 * network fails. `force` bypasses the freshness check (manual refresh).
 */
let inFlight: Promise<FxData> | null = null;

export async function getRates(force = false): Promise<FxData> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) {
    return cached;
  }
  // De-dupe concurrent callers (e.g. many price hints on one page) into one fetch.
  if (!force && inFlight) return inFlight;
  inFlight = doFetch(cached);
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

async function doFetch(cached: FxData | null): Promise<FxData> {

  for (const src of [fromFrankfurter, fromErApi]) {
    try {
      const data = await src();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        /* storage full — non-fatal */
      }
      return data;
    } catch {
      /* try next source */
    }
  }

  // Network failed: last good cache (flagged stale) or the offline estimate.
  if (cached) return { ...cached, stale: true };
  return FALLBACK;
}

/** Convert an amount between two currencies using EUR-relative rates. */
export function convert(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Rates,
): number {
  if (from === to) return amount;
  const inEur = amount / rates[from];
  return inEur * rates[to];
}
