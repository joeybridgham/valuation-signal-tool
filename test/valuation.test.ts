/* Numerical sanity tests for the valuation engine. Run: npx tsx test/valuation.test.ts */
import { dcfIntrinsic, reverseDcfGrowth, computeValuation, median } from "../lib/valuation";
import { computeScorecard, DEFAULT_WEIGHTS } from "../lib/scorecard";
import { technicalSnapshot, rsiSeries, smaSeries } from "../lib/technicals";
import type { AnalyzeResult, PricePoint } from "../lib/types";

let passed = 0, failed = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${extra}`); }
}
function approx(a: number, b: number, tol = 1e-3) { return Math.abs(a - b) <= tol; }

function mock(over: Partial<AnalyzeResult> = {}): AnalyzeResult {
  const series: PricePoint[] = [];
  let px = 100;
  for (let i = 0; i < 320; i++) { px += Math.sin(i / 9) * 1.2 + 0.05; series.push({ date: `2025-01-01`, close: Math.max(5, px) }); }
  const base: AnalyzeResult = {
    meta: { symbol: "TST", name: "Test Co", exchange: "NASDAQ", sector: "Tech", industry: "Software", currency: "USD", asOf: "2026-06-26", priceAsOf: "2026-06-25", isSample: false, notes: [] },
    market: { price: 100, dayChange: 1, dayChangePct: 0.01, marketCap: 1e11, sharesOutstanding: 1e9, beta: 1.1 },
    fundamentals: { freeCashFlow: 5e9, fcfHistory: [5e9, 4.3e9, 3.8e9], ebitda: 8e9, epsTTM: 4.5, revenue: 4e10, revenuePerShare: 40, bookValuePerShare: 20, netDebt: 1e10, totalDebt: 1.5e10, cash: 5e9, interestExpense: 6e8, taxRate: 0.21, dividendPerShare: 2.0 },
    ownMultiples: { pe: 22, evEbitda: 14, ps: 2.5, pb: 5 },
    peers: { peers: [{ symbol: "A", pe: 20, evEbitda: 13, ps: 2.2, pb: 4 }, { symbol: "B", pe: 26, evEbitda: 16, ps: 3.0, pb: 6 }], medianPE: 23, medianEvEbitda: 14.5, medianPS: 2.6, medianPB: 5 },
    analyst: { available: true, targetLow: 90, targetMean: 120, targetHigh: 150, numAnalysts: 28, estGrowth: 0.12 },
    rates: { riskFree: 0.043, equityRiskPremium: 0.05, riskFreeIsFallback: false },
    defaults: { stage1Growth: 0.12, terminalGrowth: 0.025, wacc: 0.09, horizon: 5 },
    costEquity: 0.098, waccFallback: false, dividendPayer: true, fmpDcf: 118,
    priceSeries: series, histMultiples: [], congress: [], buzz: { found: true, rank: 40, mentions: 120, mentions24hAgo: 80, upvotes: 300, change24hPct: 0.5 },
    fearGreed: { available: true, score: 28, rating: "Fear", asOf: "2026-06-26" },
    news: [], sources: {
      cashflowAnnual: { label: "Annual cash-flow (FY2024)", form: "10-K", period: "FY2024", fiscalDate: "2024-12-31", filingDate: "2025-02-10", url: "https://sec.gov/x" },
      balanceAnnual: { label: "Annual balance sheet (FY2024)", form: "10-K", period: "FY2024", fiscalDate: "2024-12-31", filingDate: "2025-02-10", url: "https://sec.gov/x" },
      ttm: { label: "TTM", form: "TTM", period: "TTM", fiscalDate: "2026-03-31", filingDate: null, url: null },
      analyst: { label: "Consensus", form: "Consensus", period: "current", fiscalDate: "2026-06-26", filingDate: null, url: null },
      peers: { label: "Peers", form: "Screen", period: "current", fiscalDate: "2026-06-26", filingDate: null, url: null },
    },
  };
  return { ...base, ...over };
}

console.log("DCF + reverse DCF");
{
  const v1 = dcfIntrinsic(5e9, 0.08, 0.025, 0.09, 5, 1e10, 1e9)!;
  const v2 = dcfIntrinsic(5e9, 0.14, 0.025, 0.09, 5, 1e10, 1e9)!;
  ok("DCF increases with stage-1 growth", v2 > v1, `${v1} !< ${v2}`);
  ok("DCF positive & sane", v1 > 0 && v1 < 1000, `${v1}`);
  const target = dcfIntrinsic(5e9, 0.10, 0.025, 0.09, 5, 1e10, 1e9)!;
  const g = reverseDcfGrowth(target, 5e9, 0.025, 0.09, 5, 1e10, 1e9)!;
  ok("reverse-DCF recovers the implied growth", approx(g, 0.10, 1e-3), `got ${g}`);
  ok("DCF unavailable for negative FCF", dcfIntrinsic(-1e9, 0.1, 0.025, 0.09, 5, 0, 1e9) === null);
  ok("DCF unavailable when WACC <= terminal g", dcfIntrinsic(5e9, 0.1, 0.1, 0.08, 5, 0, 1e9) === null);
}

console.log("median");
ok("median odd", median([3, 1, 2]) === 2);
ok("median even", median([1, 2, 3, 4]) === 2.5);
ok("median ignores null", median([null, 5, undefined, 7]) === 6);

console.log("computeValuation (healthy payer)");
{
  const d = mock();
  const val = computeValuation(d, d.defaults);
  const dcf = val.methods.find((m) => m.key === "dcf")!;
  const comps = val.methods.find((m) => m.key === "comps")!;
  const ddm = val.methods.find((m) => m.key === "ddm")!;
  const analyst = val.methods.find((m) => m.key === "analyst")!;
  ok("DCF available", dcf.available && dcf.mid! > 0);
  ok("DCF low <= mid <= high", dcf.low! <= dcf.mid! + 1e-6 && dcf.mid! <= dcf.high! + 1e-6, `${dcf.low},${dcf.mid},${dcf.high}`);
  ok("DCF flags stale FY2024 (>12mo)", dcf.stale === true, `ageMonths=${dcf.staleAgeMonths}`);
  ok("Comps available", comps.available && comps.mid! > 0);
  ok("DDM available for payer", ddm.available && ddm.mid! > 0);
  ok("Analyst not in blend", analyst.isIntrinsic === false);
  ok("blended uses dcf+comps+ddm", val.blendMethodKeys.slice().sort().join(",") === "comps,dcf,ddm", val.blendMethodKeys.join(","));
  ok("blended fair value finite", val.blendedFairValue != null && isFinite(val.blendedFairValue));
  ok("margin of safety computed", val.marginOfSafety != null);
  ok("reverse implied growth present", val.reverseImpliedGrowth != null);
  console.log(`     blended=${val.blendedFairValue?.toFixed(2)}  MoS=${(val.marginOfSafety! * 100).toFixed(1)}%  revG=${(val.reverseImpliedGrowth! * 100).toFixed(1)}%`);
}

console.log("computeValuation (negative-FCF, non-payer — SLS-like)");
{
  const d = mock({
    fundamentals: { freeCashFlow: -8e7, fcfHistory: [-8e7, -6e7], ebitda: -9e7, epsTTM: -1.2, revenue: 2e6, revenuePerShare: 0.05, bookValuePerShare: 1.5, netDebt: -5e7, totalDebt: 0, cash: 5e7, interestExpense: 0, taxRate: 0, dividendPerShare: 0 },
    dividendPayer: false, analyst: { available: true, targetLow: 2, targetMean: 9, targetHigh: 20, numAnalysts: 4, estGrowth: null },
    peers: { peers: [], medianPE: null, medianEvEbitda: null, medianPS: null, medianPB: null },
    buzz: { found: false, rank: null, mentions: null, mentions24hAgo: null, upvotes: null, change24hPct: null },
  });
  const val = computeValuation(d, d.defaults);
  const dcf = val.methods.find((m) => m.key === "dcf")!;
  const ddm = val.methods.find((m) => m.key === "ddm")!;
  ok("DCF unavailable (neg FCF) without crashing", dcf.available === false && !!dcf.unavailableReason);
  ok("DDM unavailable (non-payer)", ddm.available === false);
  ok("no crash; blended may be null", val.blendedFairValue === null || isFinite(val.blendedFairValue));
  const sc = computeScorecard(d, val, technicalSnapshot(d.priceSeries), DEFAULT_WEIGHTS);
  ok("scorecard composite valid or null", sc.composite == null || (sc.composite >= 0 && sc.composite <= 100), `${sc.composite}`);
  ok("buzz factor neutral when not found", sc.factors.find((f) => f.key === "buzz")!.score === 50);
}

console.log("scorecard (healthy)");
{
  const d = mock();
  const val = computeValuation(d, d.defaults);
  const tech = technicalSnapshot(d.priceSeries);
  const sc = computeScorecard(d, val, tech, DEFAULT_WEIGHTS);
  ok("composite present", sc.composite != null && sc.composite >= 0 && sc.composite <= 100, `${sc.composite}`);
  ok("label valid", ["Favorable", "Mixed", "Stretched"].includes(sc.label), sc.label);
  const wsum = sc.factors.filter(f => f.score != null).reduce((s, f) => s + f.weight, 0);
  ok("active weights renormalize to ~1", approx(wsum, 1, 1e-6), `${wsum}`);
  ok("timing contrarian (fear 28 -> 72)", sc.factors.find(f => f.key === "timing")!.score === 72);
  console.log(`     composite=${sc.composite?.toFixed(1)} -> ${sc.label}`);
}

console.log("technicals");
{
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
  const sma = smaSeries(closes, 10);
  ok("SMA null before period", sma[8] === null && sma[9] !== null);
  ok("SMA of linear ramp correct", approx(sma[59]!, (closes[59] + closes[50]) / 2, 1e-9));
  const rsi = rsiSeries(closes, 14);
  ok("RSI of monotonic up ~100", rsi[59]! > 99);
  ok("RSI null early", rsi[13] === null && rsi[14] !== null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
