// ============================================================================
// Labeled SAMPLE snapshots for the four featured tickers. Shown ONLY before the
// first build with API keys; every one is tagged isSample=true and carries a
// visible note. The build pipeline replaces these with real FMP+Claude data.
// Numbers are illustrative and intentionally rounded, NOT live quotes.
// ============================================================================

import type { AnalyzeResult, PricePoint, Narrative } from "./types";

// deterministic pseudo-random price series (seeded by symbol) -> realistic chart
function genSeries(seed: string, endPrice: number, days = 320, vol = 0.018, drift = 0.0006): PricePoint[] {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: number[] = [endPrice];
  for (let i = 1; i < days; i++) out.push(Math.max(0.2, out[i - 1] / (1 + drift + (rand() - 0.5) * vol)));
  out.reverse();
  const today = Date.now();
  return out.map((c, i) => ({
    date: new Date(today - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
    close: Math.round(c * 100) / 100,
    volume: Math.round(1e6 + rand() * 5e6),
  }));
}

const SAMPLE_NOTE = "Sample data, illustrative only. Replaced with live FMP data on the first build with API keys configured.";
const today = new Date().toISOString().slice(0, 10);

interface Cfg {
  symbol: string; name: string; exchange: string; sector: string; industry: string;
  price: number; shares: number; beta: number; marketCap: number;
  fcf: number; fcfPrev: number[]; ebitda: number; eps: number; revenue: number;
  netDebt: number; totalDebt: number; cash: number; interestExpense: number; taxRate: number; div: number;
  pe: number | null; evEbitda: number | null; ps: number | null; pb: number | null;
  peers: { symbol: string; pe: number | null; evEbitda: number | null; ps: number | null; pb: number | null }[];
  analyst: { low: number | null; mean: number | null; high: number | null; n: number | null };
  fmpDcf: number | null;
  fyDate: string;       // fiscal year-end of the annual filing used (drives staleness demo)
  fyLabel: string;      // "FY2025"
  fg: { score: number; rating: string };
  buzz: { found: boolean; rank: number | null; mentions: number | null; prior: number | null; up: number | null };
  congress: AnalyzeResult["congress"];
  news: AnalyzeResult["news"];
  notes: string[];
}

function build(c: Cfg): AnalyzeResult {
  const revenuePerShare = c.revenue / c.shares;
  const series = genSeries(c.symbol, c.price);
  const filing = { label: `Annual report (${c.fyLabel})`, form: "10-K", period: c.fyLabel, fiscalDate: c.fyDate, filingDate: c.fyDate, url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany" };
  const dividendPayer = c.div > 0;
  return {
    meta: { symbol: c.symbol, name: c.name, exchange: c.exchange, sector: c.sector, industry: c.industry, currency: "USD", asOf: today, priceAsOf: today, isSample: true, notes: [SAMPLE_NOTE, ...c.notes] },
    market: { price: c.price, dayChange: 0, dayChangePct: 0, marketCap: c.marketCap, sharesOutstanding: c.shares, beta: c.beta },
    fundamentals: { freeCashFlow: c.fcf, fcfHistory: [c.fcf, ...c.fcfPrev], ebitda: c.ebitda, epsTTM: c.eps, revenue: c.revenue, revenuePerShare, bookValuePerShare: Math.max(0, c.pb ? c.price / c.pb : 0), netDebt: c.netDebt, totalDebt: c.totalDebt, cash: c.cash, interestExpense: c.interestExpense, taxRate: c.taxRate, dividendPerShare: c.div },
    ownMultiples: { pe: c.pe, evEbitda: c.evEbitda, ps: c.ps, pb: c.pb },
    peers: { peers: c.peers, medianPE: med(c.peers.map((p) => p.pe)), medianEvEbitda: med(c.peers.map((p) => p.evEbitda)), medianPS: med(c.peers.map((p) => p.ps)), medianPB: med(c.peers.map((p) => p.pb)) },
    analyst: { available: c.analyst.mean != null, targetLow: c.analyst.low, targetMean: c.analyst.mean, targetHigh: c.analyst.high, numAnalysts: c.analyst.n, estGrowth: null },
    rates: { riskFree: 0.043, equityRiskPremium: 0.05, riskFreeIsFallback: false },
    defaults: { stage1Growth: 0.1, terminalGrowth: 0.025, wacc: 0.09, horizon: 5 }, // recomputed in analyze()
    costEquity: 0.043 + c.beta * 0.05,
    waccFallback: false,
    dividendPayer,
    fmpDcf: c.fmpDcf,
    priceSeries: series,
    histMultiples: genHist(c.symbol, c.pe, c.evEbitda),
    congress: c.congress,
    buzz: { found: c.buzz.found, rank: c.buzz.rank, mentions: c.buzz.mentions, mentions24hAgo: c.buzz.prior, upvotes: c.buzz.up, change24hPct: c.buzz.found && c.buzz.prior ? (c.buzz.mentions! - c.buzz.prior) / c.buzz.prior : null },
    fearGreed: { available: true, score: c.fg.score, rating: c.fg.rating, asOf: today },
    news: c.news,
    mentionHistory: genMentions(c.symbol, c.buzz.found ? (c.buzz.mentions ?? 80) : 14),
    redditPosts: genSamplePosts(c.symbol),
    sources: {
      incomeAnnual: { ...filing, label: `Annual income statement (${c.fyLabel})` },
      balanceAnnual: { ...filing, label: `Annual balance sheet (${c.fyLabel})` },
      cashflowAnnual: { ...filing, label: `Annual cash-flow statement (${c.fyLabel})` },
      ttm: { label: "Trailing-twelve-month metrics", form: "TTM", period: "TTM", fiscalDate: today, filingDate: null, url: null },
      market: { label: "Market quote", form: "Market data", period: "current", fiscalDate: today, filingDate: null, url: null },
      peers: c.peers.length ? { label: "Peer multiples (TTM)", form: "Screen", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined,
      analyst: c.analyst.mean != null ? { label: "Analyst price-target consensus", form: "Consensus", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined,
    },
  };
}
function med(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null; const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function genHist(seed: string, pe: number | null, ev: number | null) {
  const out = []; const yr = new Date().getFullYear();
  for (let i = 7; i >= 0; i--) {
    const f = 0.7 + ((seed.charCodeAt(0) + i * 13) % 60) / 100;
    out.push({ date: `${yr - i}-12-31`, pe: pe ? Math.round(pe * f * 10) / 10 : null, evEbitda: ev ? Math.round(ev * f * 10) / 10 : null });
  }
  return out;
}

const news = (items: [string, string, string][]): AnalyzeResult["news"] =>
  items.map(([title, site, d]) => ({ title, site, url: "#", publishedDate: d }));

export const SAMPLES: Record<string, AnalyzeResult> = {
  META: build({
    symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", sector: "Communication Services", industry: "Internet Content & Information",
    price: 612.4, shares: 2.53e9, beta: 1.22, marketCap: 1.55e12,
    fcf: 52e9, fcfPrev: [44e9, 19e9, 39e9], ebitda: 86e9, eps: 23.9, revenue: 164e9,
    netDebt: -45e9, totalDebt: 18e9, cash: 63e9, interestExpense: 0.5e9, taxRate: 0.18, div: 0,
    pe: 25.6, evEbitda: 17.5, ps: 9.4, pb: 8.1,
    peers: [{ symbol: "GOOGL", pe: 23, evEbitda: 15, ps: 6.2, pb: 6.5 }, { symbol: "SNAP", pe: null, evEbitda: 28, ps: 4.1, pb: 9 }, { symbol: "PINS", pe: 38, evEbitda: 22, ps: 7.5, pb: 7 }, { symbol: "GOOG", pe: 23.5, evEbitda: 15.2, ps: 6.3, pb: 6.6 }],
    analyst: { low: 470, mean: 705, high: 860, n: 58 }, fmpDcf: 640,
    fyDate: "2025-12-31", fyLabel: "FY2025", fg: { score: 64, rating: "Greed" },
    buzz: { found: true, rank: 12, mentions: 480, prior: 360, up: 2200 },
    congress: [
      { representative: "Sample Representative A", chamber: "house", type: "buy", amountRange: "$15,001 - $50,000", transactionDate: monthsAgo(2), disclosureDate: monthsAgo(1) },
      { representative: "Sample Senator B", chamber: "senate", type: "sell", amountRange: "$1,001 - $15,000", transactionDate: monthsAgo(5), disclosureDate: monthsAgo(4) },
    ],
    news: news([["Meta expands AI capacity with new data-center buildout", "Reuters", monthsAgo(0)], ["Ad revenue accelerates on improved targeting", "Bloomberg", monthsAgo(0)], ["Reality Labs losses narrow year over year", "CNBC", monthsAgo(1)]]),
    notes: [],
  }),
  UNH: build({
    symbol: "UNH", name: "UnitedHealth Group Incorporated", exchange: "NYSE", sector: "Healthcare", industry: "Healthcare Plans",
    price: 498.2, shares: 9.2e8, beta: 0.58, marketCap: 4.58e11,
    fcf: 24e9, fcfPrev: [22e9, 20e9, 18e9], ebitda: 38e9, eps: 27.6, revenue: 400e9,
    netDebt: 55e9, totalDebt: 78e9, cash: 23e9, interestExpense: 3.4e9, taxRate: 0.22, div: 8.4,
    pe: 18.1, evEbitda: 13.4, ps: 1.15, pb: 4.6,
    peers: [{ symbol: "ELV", pe: 14, evEbitda: 10, ps: 0.6, pb: 2.6 }, { symbol: "CI", pe: 12, evEbitda: 9.5, ps: 0.4, pb: 2.1 }, { symbol: "HUM", pe: 17, evEbitda: 11, ps: 0.5, pb: 2.9 }, { symbol: "CVS", pe: 10, evEbitda: 8, ps: 0.25, pb: 1.2 }, { symbol: "CNC", pe: 11, evEbitda: 8.5, ps: 0.3, pb: 1.5 }],
    analyst: { low: 480, mean: 600, high: 700, n: 24 }, fmpDcf: 560,
    fyDate: "2025-12-31", fyLabel: "FY2025", fg: { score: 41, rating: "Fear" },
    buzz: { found: false, rank: null, mentions: null, prior: null, up: null },
    congress: [
      { representative: "Sample Senator C", chamber: "senate", type: "buy", amountRange: "$50,001 - $100,000", transactionDate: monthsAgo(3), disclosureDate: monthsAgo(2) },
    ],
    news: news([["UnitedHealth reaffirms full-year earnings outlook", "WSJ", monthsAgo(0)], ["Optum segment drives revenue growth", "Reuters", monthsAgo(1)], ["Medical cost trend in focus for managed care", "Barron's", monthsAgo(1)]]),
    notes: [],
  }),
  HAL: build({
    symbol: "HAL", name: "Halliburton Company", exchange: "NYSE", sector: "Energy", industry: "Oil & Gas Equipment & Services",
    price: 37.8, shares: 8.8e8, beta: 1.05, marketCap: 3.33e10,
    fcf: 2.6e9, fcfPrev: [2.3e9, 1.4e9, 1.6e9], ebitda: 4.9e9, eps: 3.05, revenue: 23e9,
    netDebt: 6.5e9, totalDebt: 7.6e9, cash: 1.1e9, interestExpense: 0.4e9, taxRate: 0.23, div: 0.68,
    pe: 12.4, evEbitda: 6.8, ps: 1.45, pb: 2.9,
    peers: [{ symbol: "SLB", pe: 14, evEbitda: 8, ps: 1.7, pb: 3.2 }, { symbol: "BKR", pe: 15, evEbitda: 7.5, ps: 1.3, pb: 2.5 }, { symbol: "NOV", pe: 16, evEbitda: 7, ps: 1.0, pb: 1.6 }, { symbol: "WHD", pe: 18, evEbitda: 9, ps: 2.2, pb: 3.5 }],
    analyst: { low: 34, mean: 46, high: 58, n: 21 }, fmpDcf: 44,
    fyDate: "2024-12-31", fyLabel: "FY2024", fg: { score: 41, rating: "Fear" }, // intentionally stale to demo the >12mo badge
    buzz: { found: true, rank: 88, mentions: 45, prior: 60, up: 120 },
    congress: [],
    news: news([["Halliburton wins offshore services contract", "Reuters", monthsAgo(0)], ["North America completions activity stabilizes", "Bloomberg", monthsAgo(1)], ["Energy services margins hold up in soft pricing", "S&P Global", monthsAgo(2)]]),
    notes: ["Annual filing in this sample is dated FY2024 to demonstrate the >12-month staleness badge."],
  }),
  SLS: build({
    symbol: "SLS", name: "SELLAS Life Sciences Group, Inc.", exchange: "NASDAQ", sector: "Healthcare", industry: "Biotechnology",
    price: 1.42, shares: 7.1e7, beta: 1.35, marketCap: 1.0e8,
    fcf: -8.2e7, fcfPrev: [-6.5e7, -5.1e7], ebitda: -9.1e7, eps: -1.28, revenue: 2.0e6,
    netDebt: -4.8e7, totalDebt: 0, cash: 4.8e7, interestExpense: 0, taxRate: 0, div: 0,
    pe: null, evEbitda: null, ps: null, pb: 1.1,
    peers: [{ symbol: "GERN", pe: null, evEbitda: null, ps: null, pb: 3 }, { symbol: "KPTI", pe: null, evEbitda: null, ps: null, pb: 2 }],
    analyst: { low: 3, mean: 9, high: 22, n: 4 }, fmpDcf: null,
    fyDate: "2025-12-31", fyLabel: "FY2025", fg: { score: 41, rating: "Fear" },
    buzz: { found: false, rank: null, mentions: null, prior: null, up: null },
    congress: [],
    news: news([["SELLAS reports progress in Phase 3 AML program", "GlobeNewswire", monthsAgo(0)], ["Data readout timing updated for lead candidate", "BioPharma Dive", monthsAgo(2)]]),
    notes: ["Clinical-stage biotech: negative cash flow means DCF and most comps are intentionally unavailable, a deliberate empty-state showcase."],
  }),
};

function monthsAgo(m: number): string {
  return new Date(Date.now() - m * 30 * 86400000).toISOString().slice(0, 10);
}

// Pre-written sample narratives (used until a keyed build generates real ones).
export const SAMPLE_NARRATIVES: Record<string, Narrative> = {
  META: { bull: "Sample narrative. With ~$52B free cash flow and an EV/EBITDA below the peer median, the DCF midpoint sits above the current $612 price; if AI investment converts to ad efficiency, the reverse-DCF growth bar looks beatable.", base: "Sample narrative. The blended fair value lands near the price, implying a modest margin of safety; the scorecard reads Mixed as stretched market greed offsets reasonable valuation.", bear: "Sample narrative. Heavy capex and Reality Labs losses could compress free cash flow; if growth undershoots the reverse-DCF implied rate, the multiple has room to de-rate.", generatedAt: today, model: "sample" },
  UNH: { bull: "Sample narrative. A high-teens P/E against a peer median in the low teens, plus a covered dividend feeding the DDM, supports intrinsic value above the price.", base: "Sample narrative. Blended fair value modestly exceeds price; defensive beta and contrarian fear give the scorecard a constructive but not extreme read.", bear: "Sample narrative. Medical-cost inflation and regulatory risk could pressure margins; if FCF growth slows below the reverse-DCF rate, downside opens up.", generatedAt: today, model: "sample" },
  HAL: { bull: "Sample narrative. Cyclical-trough multiples and a single-digit EV/EBITDA versus peers leave upside if the cycle turns; the analyst mean sits well above price.", base: "Sample narrative. Fair value is above price but the FY2024-dated filing warrants caution; the scorecard reads Mixed.", bear: "Sample narrative. Soft completions pricing and commodity sensitivity could keep free cash flow volatile, capping the DCF.", generatedAt: today, model: "sample" },
  SLS: { bull: "Sample narrative. A binary clinical catalyst could re-rate the stock far above intrinsic cash-flow value; analyst high target is multiples of the current price.", base: "Sample narrative. With negative cash flow, intrinsic models do not apply, value rests on trial outcomes and the cash runway, not the football field.", bear: "Sample narrative. Cash burn against a small balance sheet implies dilution or financing risk; a trial miss could impair most of the equity value.", generatedAt: today, model: "sample" },
};

export function getSampleNarrative(symbol: string): Narrative | null {
  return SAMPLE_NARRATIVES[symbol.toUpperCase()] ?? null;
}

// Illustrative ~180-day mention history (seeded) for the featured samples.
function genMentions(seed: string, level: number) {
  let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const out: { date: string; mentions: number; rank: number | null; upvotes: number }[] = [];
  let v = Math.max(6, level * 0.5);
  const now = Date.now();
  for (let i = 179; i >= 0; i--) {
    v = Math.max(2, v * (1 + (rand() - 0.48) * 0.25));
    if (rand() > 0.94) v *= 1.8; // occasional spike
    const m = Math.round(v);
    out.push({ date: new Date(now - i * 86400000).toISOString().slice(0, 10), mentions: m, rank: Math.max(1, Math.round(120 - m)), upvotes: Math.round(m * (2 + rand() * 4)) });
  }
  return out;
}

function genSamplePosts(sym: string) {
  const q = `https://www.reddit.com/search/?q=${encodeURIComponent("$" + sym)}`;
  const today = new Date().toISOString().slice(0, 10);
  const wk = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  return [
    { title: `$${sym}, earnings & valuation discussion (sample)`, url: q, subreddit: "r/stocks", score: 480, created: today },
    { title: `Is $${sym} a buy at these levels? DD inside (sample)`, url: q, subreddit: "r/wallstreetbets", score: 310, created: wk },
  ];
}

// Sample ETFs for the fund view (no keys needed to demo it).
interface FundCfg {
  symbol: string; name: string; exchange: string; price: number; netAssets: number; expenseRatio: number;
  dividendYield: number; inception: string; category: string;
  sectors: [string, number][]; holdings: [string, string, number][];
  headlines: [string, string, string][];
}
function buildFund(c: FundCfg): AnalyzeResult {
  const holdings = c.holdings.map(([symbol, name, weight]) => ({ symbol, name, weight }));
  return {
    meta: { symbol: c.symbol, name: c.name, exchange: c.exchange, sector: c.category, industry: "Index Fund", currency: "USD", asOf: today, priceAsOf: today, isSample: true, notes: [SAMPLE_NOTE] },
    market: { price: c.price, dayChange: 0, dayChangePct: 0, marketCap: c.netAssets, sharesOutstanding: c.netAssets / c.price, beta: 1.0 },
    fundamentals: { freeCashFlow: 0, fcfHistory: [], ebitda: 0, epsTTM: 0, revenue: 0, revenuePerShare: 0, bookValuePerShare: 0, netDebt: 0, totalDebt: 0, cash: 0, interestExpense: 0, taxRate: 0.21, dividendPerShare: 0 },
    ownMultiples: { pe: null, evEbitda: null, ps: null, pb: null },
    peers: { peers: [], medianPE: null, medianEvEbitda: null, medianPS: null, medianPB: null },
    analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    rates: { riskFree: 0.043, equityRiskPremium: 0.05, riskFreeIsFallback: true },
    defaults: { stage1Growth: 0.08, terminalGrowth: 0.025, wacc: 0.09, horizon: 5 },
    costEquity: 0.093, waccFallback: false, dividendPayer: c.dividendYield > 0, fmpDcf: null,
    priceSeries: genSeries(c.symbol, c.price), histMultiples: [], congress: [],
    buzz: { found: false, rank: null, mentions: null, mentions24hAgo: null, upvotes: null, change24hPct: null },
    fearGreed: { available: true, score: 55, rating: "Greed", asOf: today },
    news: news(c.headlines), sources: {}, kind: "fund",
    fund: {
      expenseRatio: c.expenseRatio, netAssets: c.netAssets, inception: c.inception, dividendYield: c.dividendYield,
      turnover: 0.03, issuer: null, assetType: "ETF",
      sectors: c.sectors.map(([sector, weight]) => ({ sector, weight })), holdings,
    },
  };
}
SAMPLES.VOO = buildFund({
  symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "NYSE Arca", price: 548.2, netAssets: 1.35e12,
  expenseRatio: 0.0003, dividendYield: 0.013, inception: "2010-09-07", category: "Large Blend",
  sectors: [["Information Technology", 0.32], ["Financials", 0.13], ["Health Care", 0.11], ["Consumer Discretionary", 0.10], ["Communication Services", 0.09], ["Industrials", 0.08], ["Consumer Staples", 0.06], ["Energy", 0.04]],
  holdings: [["AAPL", "Apple Inc", 0.071], ["MSFT", "Microsoft Corp", 0.066], ["NVDA", "NVIDIA Corp", 0.061], ["AMZN", "Amazon.com Inc", 0.038], ["META", "Meta Platforms Inc", 0.025], ["GOOGL", "Alphabet Cl A", 0.021], ["GOOG", "Alphabet Cl C", 0.018], ["AVGO", "Broadcom Inc", 0.017], ["BRK.B", "Berkshire Hathaway", 0.016], ["LLY", "Eli Lilly", 0.014], ["TSLA", "Tesla Inc", 0.013], ["JPM", "JPMorgan Chase", 0.013], ["XOM", "Exxon Mobil", 0.011], ["UNH", "UnitedHealth", 0.010], ["V", "Visa Inc", 0.009], ["MA", "Mastercard", 0.008], ["COST", "Costco", 0.008], ["HD", "Home Depot", 0.007]],
  headlines: [["S&P 500 sets fresh record as megacaps lead", "Reuters", today], ["Index-fund inflows keep climbing", "Bloomberg", monthsAgo(1)]],
});
SAMPLES.QQQ = buildFund({
  symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", price: 512.4, netAssets: 3.2e11,
  expenseRatio: 0.002, dividendYield: 0.006, inception: "1999-03-10", category: "Large Growth",
  sectors: [["Information Technology", 0.50], ["Communication Services", 0.16], ["Consumer Discretionary", 0.13], ["Health Care", 0.06], ["Consumer Staples", 0.05], ["Industrials", 0.05]],
  holdings: [["AAPL", "Apple Inc", 0.089], ["MSFT", "Microsoft Corp", 0.082], ["NVDA", "NVIDIA Corp", 0.078], ["AMZN", "Amazon.com Inc", 0.051], ["AVGO", "Broadcom Inc", 0.045], ["META", "Meta Platforms Inc", 0.038], ["TSLA", "Tesla Inc", 0.029], ["GOOGL", "Alphabet Cl A", 0.025], ["GOOG", "Alphabet Cl C", 0.024], ["COST", "Costco", 0.027], ["NFLX", "Netflix Inc", 0.021], ["TMUS", "T-Mobile US", 0.018], ["CSCO", "Cisco Systems", 0.014], ["PEP", "PepsiCo Inc", 0.013], ["AMD", "Advanced Micro Devices", 0.012], ["LIN", "Linde plc", 0.011], ["INTU", "Intuit Inc", 0.010], ["QCOM", "Qualcomm Inc", 0.009]],
  headlines: [["Nasdaq-100 rebalances as AI names swell", "CNBC", today], ["Big tech earnings drive QQQ flows", "Bloomberg", monthsAgo(1)]],
});
