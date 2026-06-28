// Builds the compact, numbers-only payload sent to the narrative model.
// Shared by the live client view and the static featured pages.
import type { AnalyzeResult } from "./types";
import type { Valuation } from "./valuation";
import type { Scorecard } from "./scorecard";
import type { NarrativeInput } from "./anthropic";
import { fmtUSD, fmtPct } from "./format";

export function congressSummary(data: AnalyzeResult): string {
  const t = data.congress;
  if (!t.length) return "none disclosed in the past year";
  const buys = t.filter((x) => x.type === "buy").length;
  const sells = t.filter((x) => x.type === "sell").length;
  return `${t.length} disclosed (${buys} buys, ${sells} sells)`;
}

export function buildNarrativeInput(data: AnalyzeResult, val: Valuation, score: Scorecard): NarrativeInput {
  const price = data.market.price;
  return {
    symbol: data.meta.symbol, name: data.meta.name, sector: data.meta.sector,
    price, currency: data.meta.currency,
    blendedFairValue: val.blendedFairValue, marginOfSafety: val.marginOfSafety,
    reverseImpliedGrowth: val.reverseImpliedGrowth,
    methods: val.methods.filter((m) => m.available && m.low != null).map((m) => ({
      label: m.label,
      range: `${fmtUSD(Math.min(m.low!, m.high!))}-${fmtUSD(Math.max(m.low!, m.high!))}`,
      gapVsPrice: m.mid != null ? fmtPct((m.mid - price) / price, 0, true) : "n/a",
    })),
    scorecard: { label: score.label, composite: score.composite, factors: score.factors.map((f) => ({ label: f.label, value: f.valueText })) },
    fearGreed: data.fearGreed.available ? `${data.fearGreed.score} (${data.fearGreed.rating})` : "unavailable",
    buzz: data.buzz.found ? `${data.buzz.mentions} mentions, ${fmtPct(data.buzz.change24hPct, 0, true)} 24h` : "low chatter",
    congressSummary: congressSummary(data),
    headlines: data.news.map((n) => n.title),
  };
}
