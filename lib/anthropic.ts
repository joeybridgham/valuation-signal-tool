// Anthropic narrative. Called lazily from the client (its own 10s budget),
// modest max_tokens + a tight prompt so it returns quickly. Grounded ONLY in
// the computed numbers we pass in. Labeled in the UI as an AI synthesis.
import type { Narrative } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export interface NarrativeInput {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  currency: string;
  blendedFairValue: number | null;
  marginOfSafety: number | null;
  reverseImpliedGrowth: number | null;
  methods: { label: string; range: string; gapVsPrice: string }[];
  scorecard: { label: string; composite: number | null; factors: { label: string; value: string }[] };
  fearGreed: string;
  buzz: string;
  congressSummary: string;
  headlines: string[];
}

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 5;
}

function fmt(n: number | null, d = 2) { return n == null || !isFinite(n) ? "n/a" : n.toFixed(d); }

function buildPrompt(i: NarrativeInput): string {
  const methods = i.methods.map((m) => `- ${m.label}: ${m.range} (vs price: ${m.gapVsPrice})`).join("\n");
  const factors = i.scorecard.factors.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  return [
    `Company: ${i.name} (${i.symbol}), sector ${i.sector || "n/a"}.`,
    `Current price: ${i.currency} ${fmt(i.price)}.`,
    `Blended intrinsic fair value: ${i.blendedFairValue == null ? "n/a" : i.currency + " " + fmt(i.blendedFairValue)}.`,
    `Margin of safety vs price: ${i.marginOfSafety == null ? "n/a" : (i.marginOfSafety * 100).toFixed(1) + "%"}.`,
    `Reverse-DCF implied annual FCF growth priced in: ${i.reverseImpliedGrowth == null ? "n/a" : (i.reverseImpliedGrowth * 100).toFixed(1) + "%"}.`,
    ``,
    `Valuation methods (value ranges):`,
    methods || "- none available",
    ``,
    `Conditions scorecard: ${i.scorecard.label} (${i.scorecard.composite == null ? "n/a" : i.scorecard.composite.toFixed(0)}/100).`,
    factors,
    ``,
    `Market Fear & Greed (market-wide, contrarian): ${i.fearGreed}.`,
    `Retail buzz: ${i.buzz}.`,
    `Congressional trades (lagged disclosures): ${i.congressSummary}.`,
    `Recent headlines:`,
    ...i.headlines.slice(0, 6).map((h) => `- ${h}`),
  ].join("\n");
}

export async function generateNarrative(i: NarrativeInput): Promise<Narrative | null> {
  if (!hasAnthropicKey()) return null;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system =
    "You are an equity-research assistant for an EDUCATIONAL valuation tool. Using ONLY the numbers provided, " +
    "write a bull case, a base case, and a bear case. Each must be 2-4 sentences and must cite specific numbers " +
    "from the inputs (fair value, margin of safety, reverse-DCF growth, method ranges, scorecard factors). " +
    "Be balanced and concrete; never give a buy/sell recommendation or price prediction. " +
    'Respond with ONLY valid JSON: {"bull":"...","base":"...","bear":"..."}';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: buildPrompt(i) }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = safeParse(text);
    if (!parsed) return null;
    return { ...parsed, generatedAt: new Date().toISOString(), model };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): { bull: string; base: string; bear: string } | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    if (o.bull && o.base && o.bear) return { bull: String(o.bull), base: String(o.base), bear: String(o.bear) };
    return null;
  } catch {
    return null;
  }
}
