// ============================================================================
// "Conditions" scorecard, a transparent composite. Every factor scored 0..100
// (higher = more favorable for a value-oriented entry), every input shown, and
// weights are user-adjustable. Educational, NOT a recommendation.
// ============================================================================

import type { AnalyzeResult, ScoreWeights } from "./types";
import type { Valuation } from "./valuation";
import type { TechSnapshot } from "./technicals";
import { clamp } from "./valuation";
import { fmtPct } from "./format";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  valuation: 0.35, technicals: 0.20, analyst: 0.15, timing: 0.15, buzz: 0.15,
};

export interface FactorScore {
  key: keyof ScoreWeights;
  label: string;
  score: number | null;   // 0..100, null = no data (excluded from composite)
  weight: number;          // normalized weight actually applied
  rawWeight: number;       // the slider weight
  valueText: string;       // the underlying reading
  detail: string;          // how it was scored
  tone: "pos" | "warn" | "neg" | "neutral";
}

export interface Scorecard {
  factors: FactorScore[];
  composite: number | null;
  label: "Favorable" | "Mixed" | "Stretched" | "Insufficient data";
}

function tone(score: number | null): FactorScore["tone"] {
  if (score == null) return "neutral";
  if (score >= 62) return "pos";
  if (score >= 42) return "warn";
  return "neg";
}

export function computeScorecard(
  d: AnalyzeResult, val: Valuation, tech: TechSnapshot, weights: ScoreWeights
): Scorecard {
  const factors: FactorScore[] = [];

  // 1) Valuation, margin of safety vs blended fair value
  {
    const mos = val.marginOfSafety;
    const score = mos != null ? clamp(50 + mos * 90, 2, 98) : null;
    factors.push({
      key: "valuation", label: "Valuation", score, weight: 0, rawWeight: weights.valuation,
      valueText: mos != null ? `${fmtPct(mos, 0, true)} margin of safety` : "No blended fair value",
      detail: "Margin of safety vs the blended intrinsic fair value. Deep discount → high score.",
      tone: tone(score),
    });
  }

  // 2) Technicals, RSI(14), price vs 50/200-day SMA, position in 52-wk range
  {
    const subs: number[] = [];
    const bits: string[] = [];
    if (tech.rsi14 != null) {
      subs.push(clamp((70 - tech.rsi14) / 40 * 50 + 25, 2, 98));
      bits.push(`RSI ${tech.rsi14.toFixed(0)}`);
    }
    if (tech.week52Pos != null) {
      subs.push(clamp((1 - tech.week52Pos) * 100, 2, 98));
      bits.push(`${(tech.week52Pos * 100).toFixed(0)}% of 52-wk range`);
    }
    if (tech.aboveSma200 != null) {
      let trend = 50 + (tech.aboveSma200 ? 18 : -18) + (tech.aboveSma50 ? 12 : -12);
      subs.push(clamp(trend, 2, 98));
      bits.push(`${tech.aboveSma50 ? "above" : "below"} 50-day, ${tech.aboveSma200 ? "above" : "below"} 200-day`);
    }
    const score = subs.length ? subs.reduce((a, b) => a + b, 0) / subs.length : null;
    factors.push({
      key: "technicals", label: "Technicals", score, weight: 0, rawWeight: weights.technicals,
      valueText: bits.join(" · ") || "No price history",
      detail: "Oversold RSI, low in the 52-week range, and confirmed trend each lift the score.",
      tone: tone(score),
    });
  }

  // 3) Analyst upside, to mean target
  {
    const mean = d.analyst.targetMean;
    const up = mean != null && d.market.price > 0 ? (mean - d.market.price) / d.market.price : null;
    const score = up != null ? clamp(50 + up * 125, 2, 98) : null;
    factors.push({
      key: "analyst", label: "Analyst upside", score, weight: 0, rawWeight: weights.analyst,
      valueText: up != null ? `${fmtPct(up, 0, true)} to mean target` : "No coverage",
      detail: "Implied upside from price to the consensus mean target.",
      tone: tone(score),
    });
  }

  // 4) Market timing, CNN Fear & Greed, read CONTRARIAN
  {
    const fg = d.fearGreed.score;
    const score = fg != null ? clamp(100 - fg, 2, 98) : null;
    factors.push({
      key: "timing", label: "Market timing", score, weight: 0, rawWeight: weights.timing,
      valueText: fg != null ? `Fear & Greed ${fg.toFixed(0)} (${d.fearGreed.rating ?? ""})` : "Unavailable",
      detail: "Contrarian read of the market-wide gauge: extreme fear is favorable, extreme greed cautionary. Market-wide, not stock-specific.",
      tone: tone(score),
    });
  }

  // 5) Retail buzz, ApeWisdom 24h mention change (attention/momentum)
  {
    const ch = d.buzz.change24hPct;
    let score: number | null;
    let valueText: string;
    if (!d.buzz.found || ch == null) {
      score = 50; valueText = "Low retail chatter";
    } else {
      score = clamp(50 + ch * 40, 15, 85);
      valueText = `${fmtPct(ch, 0, true)} mentions (24h)`;
    }
    factors.push({
      key: "buzz", label: "Retail buzz", score, weight: 0, rawWeight: weights.buzz,
      valueText,
      detail: "Direction of the 24h change in Reddit mention volume (attention/momentum). A spike means crowding, read with care.",
      tone: tone(score),
    });
  }

  // normalize weights across factors that have a score
  const active = factors.filter((f) => f.score != null);
  const wsum = active.reduce((s, f) => s + f.rawWeight, 0);
  for (const f of factors) f.weight = f.score != null && wsum > 0 ? f.rawWeight / wsum : 0;

  const composite = active.length && wsum > 0
    ? active.reduce((s, f) => s + (f.score as number) * f.weight, 0) : null;

  let label: Scorecard["label"] = "Insufficient data";
  if (composite != null) {
    label = composite >= 66 ? "Favorable" : composite >= 45 ? "Mixed" : "Stretched";
  }
  return { factors, composite, label };
}

export function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const sum = w.valuation + w.technicals + w.analyst + w.timing + w.buzz;
  if (sum <= 0) return DEFAULT_WEIGHTS;
  return {
    valuation: w.valuation / sum, technicals: w.technicals / sum, analyst: w.analyst / sum,
    timing: w.timing / sum, buzz: w.buzz / sum,
  };
}
