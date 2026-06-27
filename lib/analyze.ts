// ============================================================================
// getAnalysis(symbol) — orchestrator used by /api/analyze AND the static
// featured pages. Fetches FMP + ApeWisdom + CNN in parallel, computes WACC /
// cost of equity / default assumptions, attaches any persisted mention history
// + cached Reddit posts, and returns the full payload. No FMP key => featured
// tickers return their labeled SAMPLE snapshot; anything else returns null.
// ============================================================================
import type { AnalyzeResult, MarketData, Fundamentals, Rates, Assumptions } from "./types";
import { getFmpBundle, getLiteBundle, hasFmpKey } from "./fmp";
import { hasAvKey, avEtfProfile } from "./alphavantage";
import { getBuzz } from "./apewisdom";
import { getFearGreed } from "./feargreed";
import { clamp } from "./valuation";
import { SAMPLES } from "./sampleData";
import { hasStore, kvGet } from "./store";

const ERP = 0.05;

export interface Defaults { defaults: Assumptions; costEquity: number; waccFallback: boolean; notes: string[]; }

export function computeDefaults(m: MarketData, f: Fundamentals, rates: Rates): Defaults {
  const notes: string[] = [];
  const beta = clamp(m.beta || 1, 0.4, 2.2);
  const costEquity = rates.riskFree + beta * rates.equityRiskPremium;

  let costDebt = f.totalDebt > 0 && f.interestExpense > 0 ? f.interestExpense / f.totalDebt : rates.riskFree + 0.02;
  costDebt = clamp(costDebt, rates.riskFree + 0.005, 0.15);
  const afterTaxDebt = costDebt * (1 - f.taxRate);

  const E = Math.max(0, m.marketCap), D = Math.max(0, f.totalDebt), V = E + D;
  let wacc = V > 0 ? (E / V) * costEquity + (D / V) * afterTaxDebt : costEquity;

  const terminalGrowth = 0.025;
  let waccFallback = false;
  if (!isFinite(wacc) || wacc <= terminalGrowth + 0.01 || wacc > 0.25) {
    wacc = 0.09; waccFallback = true;
    notes.push("WACC was unstable for this name — fell back to a flat 9% discount rate.");
  }

  let g1: number | null = null;
  const h = f.fcfHistory;
  if (h.length >= 2) {
    const newest = h[0], oldest = h[h.length - 1], n = h.length - 1;
    if (newest > 0 && oldest > 0) g1 = Math.pow(newest / oldest, 1 / n) - 1;
  }
  if (g1 == null || !isFinite(g1)) g1 = 0.08;
  g1 = clamp(g1, 0, 0.25);

  return { defaults: { stage1Growth: round4(g1), terminalGrowth, wacc: round4(wacc), horizon: 5 }, costEquity: round4(costEquity), waccFallback, notes };
}
function round4(x: number) { return Math.round(x * 1e4) / 1e4; }

// Attach persisted mention history + cached Reddit posts (graceful: no store => leaves them undefined)
async function attachBuzzExtras(result: AnalyzeResult): Promise<void> {
  if (!hasStore()) return;
  const sym = result.meta.symbol;
  const [history, posts] = await Promise.all([
    kvGet<AnalyzeResult["mentionHistory"]>(`mentions:${sym}`),
    kvGet<AnalyzeResult["redditPosts"]>(`posts:${sym}`),
  ]);
  if (history && history.length) result.mentionHistory = history;
  if (posts && posts.length) result.redditPosts = posts;
}

export async function getAnalysis(symbol: string): Promise<AnalyzeResult | null> {
  const sym = symbol.toUpperCase().trim().replace(/[^A-Z.\-]/g, "");
  if (!sym) return null;

  if (!hasFmpKey()) {
    const sample = SAMPLES[sym];
    return sample ? recomputeSampleDefaults(sample) : null;
  }

  const [fmpBundle, buzz, fearGreed] = await Promise.all([getFmpBundle(sym), getBuzz(sym), getFearGreed()]);
  const bundle = fmpBundle ?? (await getLiteBundle(sym));
  if (!bundle) {
    const sample = SAMPLES[sym];
    return sample ? recomputeSampleDefaults(sample) : null;
  }

  const rates: Rates = { riskFree: bundle.riskFree, equityRiskPremium: ERP, riskFreeIsFallback: bundle.riskFreeIsFallback };
  const d = computeDefaults(bundle.market, bundle.fundamentals, rates);
  const today = new Date().toISOString().slice(0, 10);

  const result: AnalyzeResult = {
    meta: {
      symbol: sym, name: bundle.meta.name, exchange: bundle.meta.exchange, sector: bundle.meta.sector,
      industry: bundle.meta.industry, currency: bundle.meta.currency, asOf: today, priceAsOf: bundle.meta.priceAsOf,
      isSample: false, notes: [...bundle.notes, ...d.notes],
    },
    market: bundle.market,
    fundamentals: bundle.fundamentals,
    ownMultiples: bundle.ownMultiples,
    peers: bundle.peers,
    analyst: bundle.analyst,
    rates,
    defaults: d.defaults,
    costEquity: d.costEquity,
    waccFallback: d.waccFallback,
    dividendPayer: bundle.fundamentals.dividendPerShare > 0,
    fmpDcf: bundle.fmpDcf,
    priceSeries: bundle.priceSeries,
    histMultiples: bundle.histMultiples,
    congress: bundle.congress,
    buzz,
    fearGreed,
    news: bundle.news,
    sources: bundle.sources,
  };
  await attachBuzzExtras(result);
  result.kind = bundle.kind ?? "stock";
  if (result.kind === "fund") {
    const fund = hasAvKey() ? await avEtfProfile(sym) : null;
    result.fund = fund ?? { expenseRatio: null, netAssets: null, inception: null, dividendYield: null, turnover: null, issuer: null, assetType: "Fund", sectors: [], holdings: [] };
  }
  return result;
}

function recomputeSampleDefaults(sample: AnalyzeResult): AnalyzeResult {
  const d = computeDefaults(sample.market, sample.fundamentals, sample.rates);
  return { ...sample, defaults: d.defaults, costEquity: d.costEquity, waccFallback: d.waccFallback };
}
