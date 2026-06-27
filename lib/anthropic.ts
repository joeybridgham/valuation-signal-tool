// ============================================================================
// Narrative generator. Provider-agnostic: uses Google Gemini's FREE API if
// GEMINI_API_KEY is set, otherwise Anthropic if ANTHROPIC_API_KEY is set.
// Called lazily from the client (its own 10s budget); modest token cap + a tight
// prompt so it returns quickly. Grounded ONLY in the numbers we pass in.
// ============================================================================
import type { Narrative } from "./types";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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

const key = (name: string) => (process.env[name] && (process.env[name] as string).length > 8 ? (process.env[name] as string) : null);
export function hasGeminiKey(): boolean { return !!key("GEMINI_API_KEY"); }
export function hasAnthropicProviderKey(): boolean { return !!key("ANTHROPIC_API_KEY"); }
// Backwards-compatible name used by the API route + featured pages: true if ANY narrative provider is configured.
export function hasAnthropicKey(): boolean { return hasGeminiKey() || hasAnthropicProviderKey(); }

const SYSTEM =
  "You are an equity-research assistant for an EDUCATIONAL valuation tool. Using ONLY the numbers provided, " +
  "write a bull case, a base case, and a bear case. Each must be 2-4 sentences and must cite specific numbers " +
  "from the inputs (fair value, margin of safety, reverse-DCF growth, method ranges, scorecard factors). " +
  "Be balanced and concrete; never give a buy/sell recommendation or price prediction. " +
  'Respond with ONLY valid JSON: {"bull":"...","base":"...","bear":"..."}';

function buildPrompt(i: NarrativeInput): string {
  const fmt = (n: number | null, d = 2) => (n == null || !isFinite(n) ? "n/a" : n.toFixed(d));
  const methods = i.methods.map((m) => `- ${m.label}: ${m.range} (vs price: ${m.gapVsPrice})`).join("\n");
  const factors = i.scorecard.factors.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  return [
    `Company: ${i.name} (${i.symbol}), sector ${i.sector || "n/a"}.`,
    `Current price: ${i.currency} ${fmt(i.price)}.`,
    `Blended intrinsic fair value: ${i.blendedFairValue == null ? "n/a" : i.currency + " " + fmt(i.blendedFairValue)}.`,
    `Margin of safety vs price: ${i.marginOfSafety == null ? "n/a" : (i.marginOfSafety * 100).toFixed(1) + "%"}.`,
    `Reverse-DCF implied annual FCF growth priced in: ${i.reverseImpliedGrowth == null ? "n/a" : (i.reverseImpliedGrowth * 100).toFixed(1) + "%"}.`,
    ``, `Valuation methods (value ranges):`, methods || "- none available",
    ``, `Conditions scorecard: ${i.scorecard.label} (${i.scorecard.composite == null ? "n/a" : i.scorecard.composite.toFixed(0)}/100).`,
    factors,
    ``, `Market Fear & Greed (market-wide, contrarian): ${i.fearGreed}.`,
    `Retail buzz: ${i.buzz}.`, `Congressional trades (lagged disclosures): ${i.congressSummary}.`,
    `Recent headlines:`, ...i.headlines.slice(0, 6).map((h) => `- ${h}`),
  ].join("\n");
}

function safeParse(text: string): { bull: string; base: string; bear: string } | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    if (o.bull && o.base && o.bear) return { bull: String(o.bull), base: String(o.base), bear: String(o.bear) };
    return null;
  } catch { return null; }
}

export async function generateNarrative(i: NarrativeInput): Promise<Narrative | null> {
  if (hasGeminiKey()) return geminiNarrative(i);
  if (hasAnthropicProviderKey()) return anthropicNarrative(i);
  return null;
}

// ---- Google Gemini (free tier) ----
async function geminiNarrative(i: NarrativeInput): Promise<Narrative | null> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${key("GEMINI_API_KEY")}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: buildPrompt(i) }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = safeParse(text);
    if (!parsed) return null;
    return { ...parsed, generatedAt: new Date().toISOString(), model: `gemini:${model}` };
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---- Anthropic (optional fallback) ----
async function anthropicNarrative(i: NarrativeInput): Promise<Narrative | null> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key("ANTHROPIC_API_KEY") as string, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages: [{ role: "user", content: buildPrompt(i) }] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = safeParse(text);
    if (!parsed) return null;
    return { ...parsed, generatedAt: new Date().toISOString(), model };
  } catch { return null; } finally { clearTimeout(timer); }
}
