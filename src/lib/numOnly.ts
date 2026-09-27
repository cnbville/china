// Keep only digits and one decimal point (a typed comma counts as the point),
// so pasted values like "$148.90" or "3,5 %" become "148.90" / "3.5".
export function numOnly(v: string): string {
  const cleaned = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  return dot === -1
    ? cleaned
    : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
}
