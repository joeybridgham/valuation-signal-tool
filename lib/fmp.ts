// ============================================================================
// Data layer with multi-source resilience (all free tiers).
//  Prices:     Stooq -> Massive aggregates -> Alpha Vantage daily -> FMP EOD
//  Peers:      Finnhub -> Massive related-companies -> built-in map
//  Statements: FMP -> SEC EDGAR (free, unlimited) -> Alpha Vantage
//  Quote/etc:  FMP primary; Finnhub / Alpha Vantage in the lite fallback.
// Every source is optional and degrades gracefully.
// ============================================================================
import type { SecurityKind } from "./types";
import { getJson, num, pick } from "./http";
import { median } from "./valuation";
import { getStooqSeries } from "./stooq";
import { hasFinnhubKey, finnhubPeers, finnhubMetric, finnhubQuote, finnhubProfile, finnhubMetricFull } from "./finnhub";
import { hasAvKey, avGlobalQuote, avOverview, avDailySeries, avStatements } from "./alphavantage";
import { hasMassiveKey, massiveAggs, massiveRelated, massiveDetails } from "./massive";
import { getEdgarFundamentals } from "./edgar";
import type {
  Fundamentals, MarketData, OwnMultiples, PeerData, PeerMultiple, AnalystData,
  PricePoint, HistMultiplePoint, CongressTrade, NewsItem, Provenance, SourceRef,
} from "./types";

const BASE = "https://financialmodelingprep.com/stable";
export const FMP_PATHS = {
  profile: "/profile", quote: "/quote", incomeAnnual: "/income-statement",
  balanceAnnual: "/balance-sheet-statement", cashflowAnnual: "/cash-flow-statement",
  ratiosTtm: "/ratios-ttm", priceEod: "/historical-price-eod/full", newsStock: "/news/stock",
} as const;

const PEER_MAP: Record<string, string[]> = {
  HAL: ["SLB", "BKR", "NOV", "WHD", "TS"], SLB: ["HAL", "BKR", "NOV", "WHD"], BKR: ["HAL", "SLB", "NOV", "WHD"],
  META: ["GOOGL", "SNAP", "PINS", "RDDT", "GOOG"], GOOGL: ["META", "MSFT", "AMZN", "GOOG"], GOOG: ["META", "MSFT", "AMZN", "GOOGL"],
  UNH: ["ELV", "CI", "HUM", "CVS", "CNC"], ELV: ["UNH", "CI", "HUM", "CVS"], CVS: ["UNH", "ELV", "CI", "HUM"],
  SLS: ["GERN", "KPTI", "CRVS", "ANAB"], NBIS: ["CRWV", "GOOGL", "ORCL", "AMD"],
  AAPL: ["MSFT", "GOOGL", "AMZN", "HPQ", "DELL"], MSFT: ["AAPL", "GOOGL", "AMZN", "ORCL", "CRM"],
  NVDA: ["AMD", "INTC", "AVGO", "QCOM", "TSM"], AMD: ["NVDA", "INTC", "AVGO", "QCOM"], TSLA: ["GM", "F", "RIVN", "LCID"],
  AMZN: ["WMT", "GOOGL", "MSFT", "TGT"], JPM: ["BAC", "WFC", "C", "GS"], NFLX: ["DIS", "WBD", "PARA", "CMCSA"],
  XOM: ["CVX", "COP", "BP", "SHEL"], CVX: ["XOM", "COP", "BP"], KO: ["PEP", "KDP", "MNST"], PEP: ["KO", "MDLZ", "KDP"],
};

function url(path: string, params: Record<string, string | number | undefined>): string {
  const key = process.env.FMP_API_KEY ?? "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  sp.set("apikey", key);
  return `${BASE}${path}?${sp.toString()}`;
}
const arr = <T = any>(x: any): T[] => (Array.isArray(x) ? x : []);
const first = (x: any): any => (Array.isArray(x) ? x[0] : x) ?? null;
export function hasFmpKey(): boolean { return !!process.env.FMP_API_KEY && process.env.FMP_API_KEY.length > 5; }
const posv = (x: number | null) => (x != null && x > 0 ? x : null);

async function getPriceSeries(sym: string): Promise<PricePoint[]> {
  let s = await getStooqSeries(sym);
  if (s.length < 60 && hasMassiveKey()) { const m = await massiveAggs(sym); if (m.length > s.length) s = m; }
  if (s.length < 60 && hasAvKey()) { const a = await avDailySeries(sym); if (a.length > s.length) s = a; }
  if (s.length < 5 && hasFmpKey()) {
    const r = await getJson(url(FMP_PATHS.priceEod, { symbol: sym, from: new Date(Date.now() - 760 * 86400000).toISOString().slice(0, 10) }));
    const rows = Array.isArray(r) ? r : arr((r as any)?.historical);
    const f = rows.map((p: any) => ({ date: String(p.date).slice(0, 10), close: num(p.close ?? p.adjClose) ?? NaN, volume: num(p.volume) ?? undefined })).filter((p: PricePoint) => isFinite(p.close)).reverse();
    if (f.length > s.length) s = f;
  }
  return s;
}

async function getPeers(sym: string, notes: string[]): Promise<PeerData> {
  let syms: string[] = [];
  if (hasFinnhubKey()) syms = (await finnhubPeers(sym)).slice(0, 5);
  if (!syms.length && hasMassiveKey()) syms = (await massiveRelated(sym)).slice(0, 5);
  if (!syms.length) syms = (PEER_MAP[sym] ?? []).filter((s) => s !== sym).slice(0, 4);
  if (!syms.length) { notes.push("No peer set available, relative valuation unavailable."); return { peers: [], medianPE: null, medianEvEbitda: null, medianPS: null, medianPB: null }; }
  let peers: PeerMultiple[];
  if (hasFinnhubKey()) {
    peers = await Promise.all(syms.map(async (s) => { const mm = await finnhubMetric(s); return { symbol: s, pe: mm?.pe ?? null, evEbitda: null, ps: mm?.ps ?? null, pb: mm?.pb ?? null }; }));
  } else if (hasFmpKey()) {
    peers = await Promise.all(syms.map(async (s) => { const r = first(await getJson(url(FMP_PATHS.ratiosTtm, { symbol: s }))); return { symbol: s, pe: pick(r, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM"), evEbitda: pick(r, "enterpriseValueMultipleTTM"), ps: pick(r, "priceToSalesRatioTTM", "priceSalesRatioTTM"), pb: pick(r, "priceToBookRatioTTM") }; }));
  } else { peers = syms.map((s) => ({ symbol: s, pe: null, evEbitda: null, ps: null, pb: null })); }
  return { peers, medianPE: median(peers.map((p) => posv(p.pe))), medianEvEbitda: median(peers.map((p) => posv(p.evEbitda))), medianPS: median(peers.map((p) => posv(p.ps))), medianPB: median(peers.map((p) => posv(p.pb))) };
}

export interface FmpBundle {
  market: MarketData; fundamentals: Fundamentals; ownMultiples: OwnMultiples; peers: PeerData; analyst: AnalystData;
  fmpDcf: number | null; priceSeries: PricePoint[]; histMultiples: HistMultiplePoint[]; congress: CongressTrade[];
  news: NewsItem[]; riskFree: number; riskFreeIsFallback: boolean;
  meta: { name: string; exchange: string; sector: string; industry: string; currency: string; priceAsOf: string };
  sources: Provenance; notes: string[]; source: string; kind: SecurityKind;
}
const blankSources = (today: string): Provenance => ({
  ttm: { label: "Trailing-twelve-month metrics", form: "TTM", period: "TTM", fiscalDate: today, filingDate: null, url: null },
  market: { label: "Market quote", form: "Market data", period: "current", fiscalDate: today, filingDate: null, url: null },
});

export async function getFmpBundle(symbol: string): Promise<FmpBundle | null> {
  if (!hasFmpKey()) return null;
  const sym = symbol.toUpperCase().trim();
  const notes: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const [profileR, quoteR, incomeR, balanceR, cashflowR, ratiosTtmR, newsR, series, peers] = await Promise.all([
    getJson(url(FMP_PATHS.profile, { symbol: sym })),
    getJson(url(FMP_PATHS.quote, { symbol: sym })),
    getJson(url(FMP_PATHS.incomeAnnual, { symbol: sym, period: "annual", limit: 2 })),
    getJson(url(FMP_PATHS.balanceAnnual, { symbol: sym, period: "annual", limit: 1 })),
    getJson(url(FMP_PATHS.cashflowAnnual, { symbol: sym, period: "annual", limit: 4 })),
    getJson(url(FMP_PATHS.ratiosTtm, { symbol: sym })),
    getJson(url(FMP_PATHS.newsStock, { symbols: sym, limit: 10 })),
    getPriceSeries(sym),
    getPeers(sym, notes),
  ]);

  const profile = first(profileR), quote = first(quoteR);
  if (!profile && !quote) return null;

  const income = arr(incomeR), cashflow = arr(cashflowR);
  const inc0 = income[0] ?? {}, bal0 = first(balanceR) ?? {}, cf0 = cashflow[0] ?? {}, ratios = first(ratiosTtmR);

  const price = pick(quote, "price") ?? pick(profile, "price") ?? 0;
  const shares = pick(quote, "sharesOutstanding") ?? pick(profile, "sharesOutstanding") ?? (price > 0 ? (pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? 0) / price : 0);
  const marketCap = pick(quote, "marketCap") ?? pick(profile, "marketCap") ?? (price && shares ? price * shares : 0);
  const market: MarketData = { price, dayChange: pick(quote, "change") ?? 0, dayChangePct: (pick(quote, "changePercentage", "changesPercentage") ?? 0) / 100, marketCap, sharesOutstanding: shares || 0, beta: pick(profile, "beta") ?? 1.0 };

  let fcfHistory = cashflow.map((c) => {
    const f = num(c.freeCashFlow); if (f != null) return f;
    const op = num(c.operatingCashFlow ?? c.netCashProvidedByOperatingActivities); const capex = num(c.capitalExpenditure);
    return op != null && capex != null ? op + capex : NaN;
  }).filter((x) => isFinite(x)) as number[];
  let totalDebt = pick(bal0, "totalDebt") ?? ((pick(bal0, "shortTermDebt") ?? 0) + (pick(bal0, "longTermDebt") ?? 0));
  let cash = pick(bal0, "cashAndShortTermInvestments", "cashAndCashEquivalents") ?? 0;
  let netDebt = pick(bal0, "netDebt") ?? (totalDebt - cash);
  let ebitda = pick(inc0, "ebitda", "EBITDA") ?? 0;
  let revenue = pick(inc0, "revenue") ?? 0;
  const ibt = pick(inc0, "incomeBeforeTax", "preTaxIncome"); const tax = pick(inc0, "incomeTaxExpense");
  let taxRate = ibt && ibt > 0 && tax != null ? tax / ibt : 0.21; taxRate = Math.max(0, Math.min(0.35, taxRate));
  const equity = pick(bal0, "totalStockholdersEquity", "totalEquity", "totalShareholdersEquity") ?? 0;
  let bookValuePerShare = shares > 0 && equity > 0 ? equity / shares : 0;
  let edEps: number | null = null, edDiv: number | null = null;

  // Statements fallback when FMP has none: SEC EDGAR (free) -> Alpha Vantage
  if (!cashflow.length) {
    const ed = await getEdgarFundamentals(sym);
    const st = ed ?? (hasAvKey() ? await avStatements(sym) : null);
    if (st) {
      if (st.fcfHistory?.length) fcfHistory = st.fcfHistory; else if (st.freeCashFlow != null) fcfHistory = [st.freeCashFlow];
      if (st.totalDebt != null) totalDebt = st.totalDebt;
      if (st.cash != null) cash = st.cash;
      if (st.netDebt != null) netDebt = st.netDebt;
      if (st.ebitda != null) ebitda = st.ebitda;
      if (st.revenue != null) revenue = st.revenue;
      if (st.taxRate != null) taxRate = st.taxRate;
      if (st.bookValuePerShare != null) bookValuePerShare = st.bookValuePerShare;
      edEps = ed?.eps ?? null; edDiv = ed?.dividendPerShare ?? null;
      notes.push(ed ? "Financial statements via SEC EDGAR (FMP had none for this name)." : "Financial statements via Alpha Vantage (FMP had none for this name).");
    } else {
      notes.push("FMP cash-flow statement returned no rows, DCF unavailable for this name.");
    }
  }

  const dividend = pick(ratios, "dividendPerShareTTM") ?? pick(profile, "lastDividend", "lastDiv") ?? edDiv ?? 0;
  const fundamentals: Fundamentals = {
    freeCashFlow: fcfHistory[0] ?? 0, fcfHistory, ebitda, epsTTM: pick(quote, "eps") ?? pick(inc0, "epsDiluted", "epsdiluted", "eps") ?? edEps ?? 0,
    revenue, revenuePerShare: shares > 0 ? revenue / shares : 0, bookValuePerShare,
    netDebt, totalDebt, cash, interestExpense: pick(inc0, "interestExpense") ?? 0, taxRate, dividendPerShare: dividend,
  };
  const ownEvEbitda = ebitda > 0 ? (marketCap + netDebt) / ebitda : null;
  const ownMultiples: OwnMultiples = {
    pe: pick(ratios, "priceToEarningsRatioTTM", "priceEarningsRatioTTM", "peRatioTTM") ?? pick(quote, "pe"),
    evEbitda: ownEvEbitda, ps: pick(ratios, "priceToSalesRatioTTM", "priceSalesRatioTTM"), pb: pick(ratios, "priceToBookRatioTTM"),
  };
  if (series.length < 30) notes.push("Sparse price history, some technicals may be limited.");

  const news: NewsItem[] = arr(newsR).slice(0, 8).map((n: any) => ({ title: String(n.title ?? "").trim(), site: String(n.site ?? n.publisher ?? "").trim(), url: String(n.url ?? n.link ?? "#"), publishedDate: String(n.publishedDate ?? n.date ?? "").slice(0, 19) })).filter((n) => n.title);

  const periodLabel = (row: any) => { const fy = row?.fiscalYear || row?.calendarYear || (row?.date ? String(row.date).slice(0, 4) : ""); return fy ? `FY${fy}` : "FY"; };
  const mkSource = (row: any, label: string): SourceRef | undefined => row && row.date ? { label, form: "10-K", period: periodLabel(row), fiscalDate: String(row.date).slice(0, 10), filingDate: row.filingDate ? String(row.filingDate).slice(0, 10) : (row.fillingDate ? String(row.fillingDate).slice(0, 10) : null), url: row.finalLink || row.link || null } : undefined;

  return {
    market, fundamentals, ownMultiples, peers, analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    fmpDcf: null, priceSeries: series, histMultiples: [], congress: [], news, riskFree: 0.043, riskFreeIsFallback: true,
    meta: { name: String(profile?.companyName ?? quote?.name ?? sym), exchange: String(profile?.exchangeShortName ?? profile?.exchange ?? ""), sector: String(profile?.sector ?? ""), industry: String(profile?.industry ?? ""), currency: String(profile?.currency ?? "USD"), priceAsOf: series.at(-1)?.date ?? today },
    sources: { ...blankSources(today), incomeAnnual: mkSource(inc0, `Annual income statement (${periodLabel(inc0)})`), balanceAnnual: mkSource(bal0, `Annual balance sheet (${periodLabel(bal0)})`), cashflowAnnual: mkSource(cf0, `Annual cash-flow statement (${periodLabel(cf0)})`), peers: peers.peers.length ? { label: "Peer multiples (TTM)", form: "Screen", period: "current", fiscalDate: today, filingDate: null, url: null } : undefined },
    notes, source: "FMP", kind: (profile?.isEtf === true || profile?.isFund === true) ? "fund" : "stock",
  };
}

export async function getLiteBundle(symbol: string): Promise<FmpBundle | null> {
  const sym = symbol.toUpperCase().trim();
  const today = new Date().toISOString().slice(0, 10);
  const notes: string[] = [];

  let series = await getPriceSeries(sym);
  let price: number | null = null, change = 0, changePct = 0;
  let name = sym, sector = "", assetType = "", shares = 0, marketCap = 0, beta = 1;
  let pe: number | null = null, ps: number | null = null, pb: number | null = null, eps = 0, dividend = 0;
  let src = "";

  if (hasFinnhubKey()) {
    const [fq, fp, fm] = await Promise.all([finnhubQuote(sym), finnhubProfile(sym), finnhubMetricFull(sym)]);
    if (fq) { price = fq.price; change = fq.change; changePct = fq.changePct; src = "Finnhub"; }
    if (fp) { name = fp.name || name; sector = fp.sector || ""; shares = fp.shares || 0; marketCap = fp.marketCap || 0; }
    if (fm) { beta = num(fm.beta) ?? 1; pe = num(fm.peTTM); ps = num(fm.psTTM); pb = num(fm.pbTTM); eps = num(fm.epsTTM) ?? 0; dividend = num(fm.dividendPerShareTTM) ?? 0; }
  }
  if (price == null && hasAvKey()) {
    const [gq, ov] = await Promise.all([avGlobalQuote(sym), avOverview(sym)]);
    if (gq) { price = gq.price; change = gq.change; changePct = gq.changePct; src = "Alpha Vantage"; }
    if (ov) { name = ov.name || name; sector = ov.sector || ""; assetType = ov.assetType || ""; shares = ov.shares ?? 0; marketCap = ov.marketCap ?? 0; beta = ov.beta ?? 1; pe = ov.pe ?? null; ps = ov.ps ?? null; pb = ov.pb ?? null; eps = ov.eps ?? 0; dividend = ov.dividend ?? 0; }
  }
  if (price == null && hasMassiveKey()) { const d = await massiveDetails(sym); if (d) { name = d.name; marketCap = d.marketCap ?? 0; shares = d.shares ?? 0; sector = d.sector; } }
  if (price == null && series.length) price = series.at(-1)!.close;
  if (price == null && !series.length) return null;

  // statements (DCF) from SEC EDGAR -> Alpha Vantage
  let fcf = 0, fcfHist: number[] = [], netDebt = 0, totalDebt = 0, cash = 0, ebitda = 0, revenue = 0, bvps = 0, taxRate = 0.21;
  {
    const ed = await getEdgarFundamentals(sym);
    const st = ed ?? (hasAvKey() ? await avStatements(sym) : null);
    if (st) {
      fcf = st.freeCashFlow ?? 0; fcfHist = st.fcfHistory; netDebt = st.netDebt ?? 0; totalDebt = st.totalDebt ?? 0;
      cash = st.cash ?? 0; ebitda = st.ebitda ?? 0; revenue = st.revenue ?? 0; bvps = st.bookValuePerShare ?? 0; taxRate = st.taxRate ?? 0.21;
      if (ed?.eps && !eps) eps = ed.eps; if (ed?.dividendPerShare && !dividend) dividend = ed.dividendPerShare;
      if (ed) notes.push("Financial statements via SEC EDGAR.");
    }
  }

  notes.push(`Live FMP unavailable, assembled from ${src || "Stooq/Massive"}.`);
  const peers = await getPeers(sym, notes);
  const market: MarketData = { price: price ?? 0, dayChange: change, dayChangePct: changePct, marketCap: marketCap || (price && shares ? price * shares : 0), sharesOutstanding: shares, beta };
  const fundamentals: Fundamentals = { freeCashFlow: fcf, fcfHistory: fcfHist, ebitda, epsTTM: eps, revenue, revenuePerShare: shares > 0 && revenue ? revenue / shares : 0, bookValuePerShare: bvps, netDebt, totalDebt, cash, interestExpense: 0, taxRate, dividendPerShare: dividend };
  const ownMultiples: OwnMultiples = { pe, evEbitda: ebitda > 0 ? (market.marketCap + netDebt) / ebitda : null, ps, pb };
  return {
    market, fundamentals, ownMultiples, peers, analyst: { available: false, targetLow: null, targetMean: null, targetHigh: null, numAnalysts: null, estGrowth: null },
    fmpDcf: null, priceSeries: series, histMultiples: [], congress: [], news: [], riskFree: 0.043, riskFreeIsFallback: true,
    meta: { name, exchange: "", sector, industry: sector, currency: "USD", priceAsOf: series.at(-1)?.date ?? today },
    sources: blankSources(today), notes, source: src || "Stooq", kind: assetType.toUpperCase() === "ETF" ? "fund" : "stock",
  };
}
