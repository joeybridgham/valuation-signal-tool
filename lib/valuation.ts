// ============================================================================
// Valuation engine — pure, deterministic, shared by server (defaults / build)
// and client (live slider recompute). No I/O here.
//
// Every method returns: value range, a step-by-step calculation breakdown
// (recomputed live from the current assumptions), the source filings it used,
// and a staleness flag (true when it leans on an annual 10-K > 12 months old).
// ============================================================================

import type { AnalyzeResult, Assumptions, SourceRef } from "./types";
import { fmtUSD, fmtPct, fmtX, compact, fmtNum } from "./format";

export interface Step {
  label: string;
  value: string;
  hint?: string;
}

export type MethodKey = "dcf" | "comps" | "ddm" | "analyst";

export interface MethodResult {
  key: MethodKey;
  label: string;
  sublabel: string;
  available: boolean;
  unavailableReason?: string;
  isIntrinsic: boolean;      // included in the blended fair value?
  low: number | null;
  high: number | null;
  mid: number | null;        // point / midpoint
  formula: string;
  steps: Step[];
  sources: SourceRef[];
  asOfDate: string | null;   // latest underlying data date used
  stale: boolean;            // underlying annual filing older than 12 months
  staleAgeMonths: number | null;
  note?: string;
}

export interface Valuation {
  price: number;
  wacc: number;
  costEquity: number;
  waccFallback: boolean;
  methods: MethodResult[];
  blendedFairValue: number | null;
  blendMethodKeys: MethodKey[];
  marginOfSafety: number | null;     // (blended - price) / price
  reverseImpliedGrowth: number | null;
}

// Range-flex defaults: bar width comes from flexing growth ± and WACC ±.
export const FLEX_GROWTH = 0.03;
export const FLEX_WACC = 0.0075;

// ---------------------------------------------------------------- helpers ----
export function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.abs(a - b) / 86400000;
}

// Latest annual-filing age across the sources a method used.
function staleInfo(sources: SourceRef[], asOf: string): {
  stale: boolean; ageMonths: number | null; asOfDate: string | null;
} {
  const dated = sources.filter((s) => s.fiscalDate);
  if (!dated.length) return { stale: false, ageMonths: null, asOfDate: null };
  const latest = dated.reduce((p, c) => (c.fiscalDate > p.fiscalDate ? c : p));
  const annuals = sources.filter((s) => s.form === "10-K" || s.period.startsWith("FY"));
  const asOfDate = latest.fiscalDate;
  if (!annuals.length) return { stale: false, ageMonths: null, asOfDate };
  const newestAnnual = annuals.reduce((p, c) => (c.fiscalDate > p.fiscalDate ? c : p));
  const days = daysBetween(asOf, newestAnnual.fiscalDate);
  return { stale: days > 365, ageMonths: Math.round(days / 30.44), asOfDate };
}

// ---------------------------------------------------------------- DCF ----
// Two-stage FCFF: explicit horizon at stage-1 growth, Gordon terminal value.
export function dcfIntrinsic(
  fcf0: number, g1: number, gT: number, wacc: number, horizon: number,
  netDebt: number, shares: number
): number | null {
  if (!(fcf0 > 0) || !(shares > 0) || !(wacc > gT)) return null;
  let pvStage = 0;
  for (let t = 1; t <= horizon; t++) {
    const fcf = fcf0 * Math.pow(1 + g1, t);
    pvStage += fcf / Math.pow(1 + wacc, t);
  }
  const fcfH = fcf0 * Math.pow(1 + g1, horizon);
  const tv = (fcfH * (1 + gT)) / (wacc - gT);
  const pvTv = tv / Math.pow(1 + wacc, horizon);
  const ev = pvStage + pvTv;
  return (ev - netDebt) / shares;
}

// Solve for the stage-1 growth the current price implies (bisection).
export function reverseDcfGrowth(
  price: number, fcf0: number, gT: number, wacc: number, horizon: number,
  netDebt: number, shares: number
): number | null {
  if (!(fcf0 > 0) || !(shares > 0) || !(price > 0) || !(wacc > gT)) return null;
  const f = (g: number) => {
    const v = dcfIntrinsic(fcf0, g, gT, wacc, horizon, netDebt, shares);
    return v == null ? NaN : v - price;
  };
  let lo = -0.6, hi = 1.0;
  const flo = f(lo), fhi = f(hi);
  if (isNaN(flo) || isNaN(fhi)) return null;
  if (flo > 0) return lo;   // price below even the floor-growth value
  if (fhi < 0) return hi;   // price above the cap-growth value
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-6 || hi - lo < 1e-7) return mid;
    if (fm < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function buildDcf(d: AnalyzeResult, a: Assumptions): MethodResult {
  const f = d.fundamentals;
  const sources: SourceRef[] = [];
  if (d.sources.cashflowAnnual) sources.push(d.sources.cashflowAnnual);
  if (d.sources.balanceAnnual) sources.push(d.sources.balanceAnnual);
  const st = staleInfo(sources, d.meta.asOf);

  const base: Partial<MethodResult> = {
    key: "dcf", label: "Discounted Cash Flow", sublabel: "Two-stage FCFF",
    isIntrinsic: true, sources,
    formula: "EV = Σ FCFₜ /(1+WACC)ᵗ + [FCF_H·(1+g∞)/(WACC−g∞)]/(1+WACC)^H  →  (EV − Net debt) / Shares",
    asOfDate: st.asOfDate, stale: st.stale, staleAgeMonths: st.ageMonths,
  };

  if (!(f.freeCashFlow > 0)) {
    return {
      ...(base as MethodResult), available: false, low: null, high: null, mid: null,
      unavailableReason: "Latest free cash flow is not positive, so a growth-based DCF is not meaningful here. Intrinsic value relies on comps / analyst anchors instead.",
      steps: [{ label: "Latest free cash flow", value: fmtUSD(f.freeCashFlow, { compact: true }) }],
    };
  }

  const mid = dcfIntrinsic(f.freeCashFlow, a.stage1Growth, a.terminalGrowth, a.wacc, a.horizon, f.netDebt, d.market.sharesOutstanding);
  const lowWacc = clamp(a.wacc + FLEX_WACC, a.terminalGrowth + 0.005, 0.4);
  const highWacc = clamp(a.wacc - FLEX_WACC, a.terminalGrowth + 0.005, 0.4);
  const low = dcfIntrinsic(f.freeCashFlow, a.stage1Growth - FLEX_GROWTH, a.terminalGrowth, lowWacc, a.horizon, f.netDebt, d.market.sharesOutstanding);
  const high = dcfIntrinsic(f.freeCashFlow, a.stage1Growth + FLEX_GROWTH, a.terminalGrowth, highWacc, a.horizon, f.netDebt, d.market.sharesOutstanding);

  // live calc breakdown
  let pvStage = 0; const yearRows: Step[] = [];
  for (let t = 1; t <= a.horizon; t++) {
    const fcf = f.freeCashFlow * Math.pow(1 + a.stage1Growth, t);
    const pv = fcf / Math.pow(1 + a.wacc, t);
    pvStage += pv;
    yearRows.push({ label: `Year ${t} — FCF ${compact(fcf)} → PV`, value: fmtUSD(pv, { compact: true }) });
  }
  const fcfH = f.freeCashFlow * Math.pow(1 + a.stage1Growth, a.horizon);
  const tv = (fcfH * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  const pvTv = tv / Math.pow(1 + a.wacc, a.horizon);
  const ev = pvStage + pvTv;
  const equity = ev - f.netDebt;

  const steps: Step[] = [
    { label: "Base free cash flow (FCF₀)", value: fmtUSD(f.freeCashFlow, { compact: true }), hint: "Operating cash flow − capex, latest annual" },
    { label: "Stage-1 growth (g₁)", value: fmtPct(a.stage1Growth) },
    { label: "Forecast horizon", value: `${a.horizon} yrs` },
    { label: "Terminal growth (g∞)", value: fmtPct(a.terminalGrowth) },
    { label: "Discount rate (WACC)", value: fmtPct(a.wacc) },
    ...yearRows,
    { label: "PV of stage-1 FCF", value: fmtUSD(pvStage, { compact: true }) },
    { label: `Terminal value @ year ${a.horizon}`, value: fmtUSD(tv, { compact: true }) },
    { label: "PV of terminal value", value: fmtUSD(pvTv, { compact: true }) },
    { label: "Enterprise value", value: fmtUSD(ev, { compact: true }) },
    { label: "− Net debt", value: fmtUSD(f.netDebt, { compact: true }) },
    { label: "Equity value", value: fmtUSD(equity, { compact: true }) },
    { label: "÷ Shares outstanding", value: compact(d.market.sharesOutstanding) },
    { label: "Intrinsic value / share", value: fmtUSD(mid) },
    { label: "Range (flex g₁ ±3pts, WACC ∓0.75pt)", value: `${fmtUSD(low)} – ${fmtUSD(high)}` },
  ];

  return {
    ...(base as MethodResult), available: mid != null,
    low, high, mid,
    steps,
    note: d.fmpDcf != null ? `Cross-check: FMP's own DCF model = ${fmtUSD(d.fmpDcf)}.` : undefined,
  };
}

// ---------------------------------------------------------------- Comps ----
function buildComps(d: AnalyzeResult, _a: Assumptions): MethodResult {
  const f = d.fundamentals;
  const p = d.peers;
  const shares = d.market.sharesOutstanding;
  const sources: SourceRef[] = [];
  if (d.sources.ttm) sources.push(d.sources.ttm);
  if (d.sources.balanceAnnual) sources.push(d.sources.balanceAnnual);
  if (d.sources.peers) sources.push(d.sources.peers);
  const st = staleInfo(sources, d.meta.asOf);

  const implied: { label: string; mult: number | null; value: number | null }[] = [];
  // P/E
  let peVal: number | null = null;
  if (p.medianPE && p.medianPE > 0 && f.epsTTM > 0) peVal = p.medianPE * f.epsTTM;
  implied.push({ label: "Peer median P/E × EPS(TTM)", mult: p.medianPE, value: peVal });
  // EV/EBITDA
  let evVal: number | null = null;
  if (p.medianEvEbitda && p.medianEvEbitda > 0 && f.ebitda > 0 && shares > 0) {
    evVal = (p.medianEvEbitda * f.ebitda - f.netDebt) / shares;
  }
  implied.push({ label: "Peer median EV/EBITDA × EBITDA", mult: p.medianEvEbitda, value: evVal });
  // P/S
  let psVal: number | null = null;
  if (p.medianPS && p.medianPS > 0 && f.revenuePerShare > 0) psVal = p.medianPS * f.revenuePerShare;
  implied.push({ label: "Peer median P/S × Rev/share", mult: p.medianPS, value: psVal });

  const vals = implied.map((i) => i.value).filter((v): v is number => v != null && isFinite(v) && v > 0);
  const available = vals.length > 0;
  const low = available ? Math.min(...vals) : null;
  const high = available ? Math.max(...vals) : null;
  const mid = available ? median(vals) : null;

  const steps: Step[] = [
    { label: "Peer set", value: p.peers.map((x) => x.symbol).slice(0, 8).join(", ") || "—", hint: `${p.peers.length} peers` },
    { label: "EPS (TTM)", value: fmtUSD(f.epsTTM) },
    { label: "EBITDA (TTM)", value: fmtUSD(f.ebitda, { compact: true }) },
    { label: "Revenue / share (TTM)", value: fmtUSD(f.revenuePerShare) },
    { label: "Net debt", value: fmtUSD(f.netDebt, { compact: true }) },
    ...implied.map((i) => ({
      label: i.label,
      value: i.value != null ? `${fmtX(i.mult)} → ${fmtUSD(i.value)}` : `${fmtX(i.mult)} → n/a`,
    })),
    { label: "Implied range", value: available ? `${fmtUSD(low)} – ${fmtUSD(high)}` : "—" },
    { label: "Midpoint (median)", value: fmtUSD(mid) },
  ];

  return {
    key: "comps", label: "Relative Valuation", sublabel: "Peer multiples",
    isIntrinsic: true, available, low, high, mid,
    unavailableReason: available ? undefined : "No usable peer multiples (peers, EPS, EBITDA and revenue all unavailable or non-positive).",
    formula: "Apply peer-median P/E, EV/EBITDA and P/S to this company's EPS, EBITDA and revenue; range = spread of the implied values.",
    steps, sources, asOfDate: st.asOfDate, stale: st.stale, staleAgeMonths: st.ageMonths,
  };
}

// ---------------------------------------------------------------- DDM ----
function buildDdm(d: AnalyzeResult, a: Assumptions): MethodResult {
  const f = d.fundamentals;
  const ce = d.costEquity;
  const sources: SourceRef[] = [];
  if (d.sources.ttm) sources.push(d.sources.ttm);
  const st = staleInfo(sources, d.meta.asOf);

  const baseMeta = {
    key: "ddm" as const, label: "Dividend Discount", sublabel: "Gordon growth",
    isIntrinsic: true, sources, asOfDate: st.asOfDate, stale: st.stale, staleAgeMonths: st.ageMonths,
    formula: "Value = D₁ / (cost of equity − g_div),  with g_div capped below the cost of equity.",
  };

  if (!(f.dividendPerShare > 0)) {
    return {
      ...baseMeta, available: false, low: null, high: null, mid: null,
      unavailableReason: "Non-dividend payer — the dividend discount model does not apply.",
      steps: [{ label: "Dividend / share (TTM)", value: fmtUSD(0) }],
    };
  }
  if (!(ce > 0)) {
    return { ...baseMeta, available: false, low: null, high: null, mid: null,
      unavailableReason: "Cost of equity unavailable.", steps: [] };
  }

  const gDiv = clamp(a.terminalGrowth, 0, ce - 0.01);
  const value = (f.dividendPerShare * (1 + gDiv)) / (ce - gDiv);
  const gLow = clamp(gDiv - 0.005, 0, ce - 0.01);
  const gHigh = clamp(gDiv + 0.005, 0, ce - 0.011);
  const low = (f.dividendPerShare * (1 + gLow)) / (ce - gLow);
  const high = (f.dividendPerShare * (1 + gHigh)) / (ce - gHigh);

  const steps: Step[] = [
    { label: "Dividend / share (D₀, TTM)", value: fmtUSD(f.dividendPerShare) },
    { label: "Cost of equity (CAPM)", value: fmtPct(ce) },
    { label: "Dividend growth (g_div)", value: fmtPct(gDiv), hint: "capped below cost of equity" },
    { label: "Next-year dividend (D₁)", value: fmtUSD(f.dividendPerShare * (1 + gDiv)) },
    { label: "Value = D₁ / (rₑ − g)", value: fmtUSD(value) },
    { label: "Range (g_div ±0.5pt)", value: `${fmtUSD(Math.min(low, high))} – ${fmtUSD(Math.max(low, high))}` },
  ];

  return {
    ...baseMeta, available: isFinite(value) && value > 0,
    low: Math.min(low, high), high: Math.max(low, high), mid: value, steps,
  };
}

// ---------------------------------------------------------------- Analyst ----
function buildAnalyst(d: AnalyzeResult): MethodResult {
  const an = d.analyst;
  const sources: SourceRef[] = d.sources.analyst ? [d.sources.analyst] : [];
  const available = an.available && an.targetMean != null;
  return {
    key: "analyst", label: "Analyst Targets", sublabel: "Street consensus",
    isIntrinsic: false, available,
    low: an.targetLow, high: an.targetHigh, mid: an.targetMean,
    unavailableReason: available ? undefined : "No analyst price-target coverage available.",
    formula: "Sell-side 12-month price targets (low / mean / high). A market anchor — shown separately, not blended into intrinsic value.",
    steps: [
      { label: "Low target", value: fmtUSD(an.targetLow) },
      { label: "Mean target", value: fmtUSD(an.targetMean) },
      { label: "High target", value: fmtUSD(an.targetHigh) },
      { label: "Analysts", value: an.numAnalysts != null ? fmtNum(an.numAnalysts, 0) : "—" },
    ],
    sources, asOfDate: an.available ? d.meta.asOf : null, stale: false, staleAgeMonths: null,
  };
}

// ---------------------------------------------------------------- top level ----
export function computeValuation(d: AnalyzeResult, a: Assumptions): Valuation {
  const f = d.fundamentals;
  const dcf = buildDcf(d, a);
  const comps = buildComps(d, a);
  const ddm = buildDdm(d, a);
  const analyst = buildAnalyst(d);

  const methods = [dcf, comps, ddm, analyst];

  const blendKeys: MethodKey[] = [];
  const mids: number[] = [];
  for (const m of [dcf, comps, ddm]) {
    if (m.available && m.isIntrinsic && m.mid != null && isFinite(m.mid) && m.mid > 0) {
      mids.push(m.mid); blendKeys.push(m.key);
    }
  }
  const blendedFairValue = mids.length ? mids.reduce((s, x) => s + x, 0) / mids.length : null;
  const marginOfSafety = blendedFairValue != null && d.market.price > 0
    ? (blendedFairValue - d.market.price) / d.market.price : null;

  const reverseImpliedGrowth = reverseDcfGrowth(
    d.market.price, f.freeCashFlow, a.terminalGrowth, a.wacc, a.horizon, f.netDebt, d.market.sharesOutstanding
  );

  return {
    price: d.market.price, wacc: a.wacc, costEquity: d.costEquity, waccFallback: d.waccFallback,
    methods, blendedFairValue, blendMethodKeys: blendKeys, marginOfSafety, reverseImpliedGrowth,
  };
}
