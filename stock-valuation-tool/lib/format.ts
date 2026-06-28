// Shared formatting helpers (client + server). Numbers use tabular mono in UI.

export function fmtUSD(v: number | null | undefined, opts?: { dp?: number; compact?: boolean }): string {
  if (v == null || !isFinite(v)) return "n/a";
  const dp = opts?.dp ?? (Math.abs(v) >= 100 ? 0 : 2);
  if (opts?.compact) return "$" + compact(v);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(v);
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v == null || !isFinite(v)) return "n/a";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(v);
}

export function fmtPct(v: number | null | undefined, dp = 1, withSign = false): string {
  if (v == null || !isFinite(v)) return "n/a";
  const s = (v * 100).toFixed(dp);
  const sign = withSign && v > 0 ? "+" : "";
  return `${sign}${s}%`;
}

export function fmtX(v: number | null | undefined, dp = 1): string {
  if (v == null || !isFinite(v)) return "n/a";
  return `${v.toFixed(dp)}×`;
}

export function compact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "n/a";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "n/a";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return "n/a";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}
