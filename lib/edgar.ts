// SEC EDGAR XBRL company-facts — FREE, official, no key, effectively unlimited
// (fair-use rate, a descriptive User-Agent is required). The robust free source
// for financial statements: covers every US SEC filer, including foreign issuers
// (20-F). Used to power DCF/comps/asset when FMP's free tier has no statements.
import { num } from "./http";

const UA = "valuation-signal-tool (contact: joeybridgham@gmail.com)";
let tickerMap: Record<string, string> | null = null;

async function loadTickerMap(): Promise<Record<string, string>> {
  if (tickerMap) return tickerMap;
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": UA }, next: { revalidate: 60 * 60 * 24 * 7 } });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    for (const key of Object.keys(data)) { const e = data[key]; if (e?.ticker && e?.cik_str != null) map[String(e.ticker).toUpperCase()] = String(e.cik_str).padStart(10, "0"); }
    tickerMap = map; return map;
  } catch { return {}; }
}

// latest annual values for the first matching concept, newest-first, one per year
function annual(facts: any, concepts: string[], unit = "USD"): { val: number; year: string }[] {
  for (const c of concepts) {
    const u = facts?.[c]?.units?.[unit];
    if (!Array.isArray(u) || !u.length) continue;
    const fy = u.filter((x: any) => (x.form === "10-K" || x.form === "20-F") && x.fp === "FY" && x.val != null);
    const rows = (fy.length ? fy : u).map((x: any) => ({ val: Number(x.val), year: String(x.end || x.filed || "").slice(0, 4) })).filter((r) => isFinite(r.val) && r.year);
    rows.sort((a, b) => (a.year < b.year ? 1 : -1));
    const seen = new Set<string>(); const out: { val: number; year: string }[] = [];
    for (const r of rows) if (!seen.has(r.year)) { seen.add(r.year); out.push(r); }
    if (out.length) return out;
  }
  return [];
}
const one = (facts: any, concepts: string[], unit = "USD") => annual(facts, concepts, unit)[0]?.val ?? null;

export interface EdgarFundamentals {
  freeCashFlow: number | null; fcfHistory: number[]; netDebt: number | null; cash: number | null; totalDebt: number | null;
  ebitda: number | null; eps: number | null; revenue: number | null; taxRate: number | null;
  bookValuePerShare: number | null; shares: number | null; dividendPerShare: number | null;
}

export async function getEdgarFundamentals(symbol: string): Promise<EdgarFundamentals | null> {
  const map = await loadTickerMap();
  const cik = map[symbol.toUpperCase()];
  if (!cik) return null;
  let facts: any;
  try {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: { "User-Agent": UA }, next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return null;
    facts = (await res.json())?.facts?.["us-gaap"];
  } catch { return null; }
  if (!facts) return null;

  const ocf = annual(facts, ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]);
  const capex = annual(facts, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements"]);
  const capexByYr = new Map(capex.map((r) => [r.year, r.val]));
  const fcfHistory = ocf.map((r) => r.val - (capexByYr.get(r.year) ?? 0)).filter((x) => isFinite(x));

  const cash = (one(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]) ?? 0) + (one(facts, ["ShortTermInvestments"]) ?? 0);
  const totalDebt = (one(facts, ["LongTermDebtNoncurrent", "LongTermDebt"]) ?? 0) + (one(facts, ["LongTermDebtCurrent", "DebtCurrent"]) ?? 0);
  const equity = one(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]);
  const shares = one(facts, ["CommonStockSharesOutstanding"], "shares") ?? one(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], "shares");
  const revenue = one(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]);
  const opInc = one(facts, ["OperatingIncomeLoss"]);
  const da = one(facts, ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"]);
  const pretax = one(facts, ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"]);
  const taxExp = one(facts, ["IncomeTaxExpenseBenefit"]);

  if (!fcfHistory.length && revenue == null && equity == null) return null;
  return {
    freeCashFlow: fcfHistory[0] ?? null, fcfHistory, cash, totalDebt, netDebt: totalDebt - cash,
    ebitda: opInc != null ? opInc + (da ?? 0) : null, eps: one(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares"),
    revenue, taxRate: pretax && pretax > 0 && taxExp != null ? Math.max(0, Math.min(0.35, taxExp / pretax)) : null,
    bookValuePerShare: equity != null && shares ? equity / shares : null, shares,
    dividendPerShare: one(facts, ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"], "USD/shares"),
  };
}
