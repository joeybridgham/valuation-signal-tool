// ============================================================================
// Shared types. The AnalyzeResult is the single payload returned by
// /api/analyze (and produced at build time for featured tickers). It carries
// every RAW INPUT the browser needs to recompute valuations and redraw charts
// with no further server round-trips.
// ============================================================================

export type Chamber = "house" | "senate";
export type TxnType = "buy" | "sell" | "exchange" | "unknown";

export interface Meta {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  currency: string;
  asOf: string;        // ISO date the analysis was assembled
  priceAsOf: string;   // date of the latest price (end-of-day on FMP free tier)
  isSample: boolean;   // true => placeholder data shown before a keyed build
  notes: string[];     // graceful-degradation notes ("WACC fell back to 9%", etc.)
}

export interface MarketData {
  price: number;
  dayChange: number;
  dayChangePct: number;
  marketCap: number;
  sharesOutstanding: number;
  beta: number;
}

// Raw fundamentals needed for the math. All in reporting currency, absolute units.
export interface Fundamentals {
  freeCashFlow: number;        // latest FCF = operating cash flow - capex
  fcfHistory: number[];        // recent annual FCF, newest first (for CAGR)
  ebitda: number;              // TTM
  epsTTM: number;
  revenue: number;             // TTM
  revenuePerShare: number;
  bookValuePerShare: number;
  netDebt: number;             // total debt - cash & ST investments
  totalDebt: number;
  cash: number;
  interestExpense: number;
  taxRate: number;             // effective, 0..0.35
  dividendPerShare: number;    // TTM; 0 for non-payers
}

export interface OwnMultiples {
  pe: number | null;
  evEbitda: number | null;
  ps: number | null;
  pb: number | null;
}

export interface PeerMultiple {
  symbol: string;
  pe: number | null;
  evEbitda: number | null;
  ps: number | null;
  pb: number | null;
}

export interface PeerData {
  peers: PeerMultiple[];
  medianPE: number | null;
  medianEvEbitda: number | null;
  medianPS: number | null;
}

export interface AnalystData {
  available: boolean;
  targetLow: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  numAnalysts: number | null;
  estGrowth: number | null;   // forward growth estimate (decimal), if available
}

export interface Rates {
  riskFree: number;            // decimal, 10y treasury (or fallback)
  equityRiskPremium: number;   // decimal default 0.05
  riskFreeIsFallback: boolean;
}

export interface Assumptions {
  stage1Growth: number;  // decimal
  terminalGrowth: number; // decimal
  wacc: number;          // decimal
  horizon: number;       // years (integer)
}

export interface PricePoint {
  date: string;  // YYYY-MM-DD
  close: number;
  volume?: number;
}

export interface HistMultiplePoint {
  date: string;
  pe: number | null;
  evEbitda: number | null;
}

export interface CongressTrade {
  representative: string;
  chamber: Chamber;
  type: TxnType;
  amountRange: string;   // e.g. "$1,001 - $15,000"
  transactionDate: string;
  disclosureDate: string;
}

export interface BuzzData {
  found: boolean;
  rank: number | null;
  mentions: number | null;
  mentions24hAgo: number | null;
  upvotes: number | null;
  change24hPct: number | null; // decimal
}

export interface FearGreed {
  available: boolean;
  score: number | null;   // 0..100
  rating: string | null;  // "Fear", "Greed", etc.
  asOf: string | null;
}

export interface NewsItem {
  title: string;
  site: string;
  url: string;
  publishedDate: string;
  snippet?: string;
}

// The full payload.
export interface AnalyzeResult {
  meta: Meta;
  market: MarketData;
  fundamentals: Fundamentals;
  ownMultiples: OwnMultiples;
  peers: PeerData;
  analyst: AnalystData;
  rates: Rates;
  defaults: Assumptions;       // default assumptions (WACC computed server-side)
  costEquity: number;          // CAPM cost of equity (for DDM, shown)
  waccFallback: boolean;
  dividendPayer: boolean;
  fmpDcf: number | null;       // FMP's own DCF value (cross-check)
  priceSeries: PricePoint[];   // daily, oldest -> newest
  histMultiples: HistMultiplePoint[];
  congress: CongressTrade[];
  buzz: BuzzData;
  fearGreed: FearGreed;
  news: NewsItem[];
  sources: Provenance;
  mentionHistory?: MentionPoint[];
  redditPosts?: RedditLink[];
  kind?: SecurityKind;
  fund?: FundData;
}

// ---- Narrative ----
export interface Narrative {
  bull: string;
  base: string;
  bear: string;
  generatedAt: string;
  model: string;
}

// ---- Default scorecard weights (sum to 1) ----
export interface ScoreWeights {
  valuation: number;
  technicals: number;
  analyst: number;
  timing: number;
  buzz: number;
}

// ---- Source provenance (which filing/feed each number came from) ----
export interface SourceRef {
  label: string;       // e.g. "Annual cash-flow statement (FY2025)"
  form: string;        // "10-K", "10-Q", "TTM", "Market data", "Consensus"
  period: string;      // "FY2025", "TTM", "Q2 2025", etc.
  fiscalDate: string;  // period-end date (YYYY-MM-DD)
  filingDate: string | null;  // date filed with the SEC
  url: string | null;  // direct link to the SEC filing document, when available
}

export interface Provenance {
  incomeAnnual?: SourceRef;
  balanceAnnual?: SourceRef;
  cashflowAnnual?: SourceRef;
  ttm?: SourceRef;      // trailing-twelve-month aggregate as-of
  market?: SourceRef;   // price / quote as-of
  peers?: SourceRef;
  analyst?: SourceRef;
}

// ---- Persisted retail-buzz history + cached Reddit posts ----
export interface MentionPoint {
  date: string;
  mentions: number;
  rank?: number | null;
  upvotes?: number;
}
export interface RedditLink {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  created: string;
}

// ---- Mutual fund / ETF view ----
export type SecurityKind = "stock" | "fund";
export interface FundHolding { symbol: string; name: string; weight: number; }
export interface FundData {
  expenseRatio: number | null;
  netAssets: number | null;
  inception: string | null;
  dividendYield: number | null;
  turnover: number | null;
  issuer: string | null;
  assetType: string;
  sectors: { sector: string; weight: number }[];
  holdings: FundHolding[];
}
