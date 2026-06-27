// ============================================================================
// Narrative generator. Provider-agnostic: Google Gemini (FREE) if GEMINI_API_KEY
// is set, else Anthropic if ANTHROPIC_API_KEY is set. Returns {narrative} on
// success or {error} with the upstream reason so the UI can show what happened.
// Built for compatibility: system prompt folded into the message, no strict
// JSON mode, and a model fallback.
// ============================================================================
import type { Narrative } from "./types";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface NarrativeInput {
  symbol: string; name: string; sector: string; price: number; currency: string;
  blendedFairValue: number | null; marginOfSafety: number | null; reverseImpliedGrowth: number | null;
  methods: { label: string; range: string; gapVsPrice: string }[];
  scorecard: { label: string; composite: number | null; factors: { label: string; value: string }[] };
  fearGreed: string; buzz: string; congressSummary: string; headlines: string[];
}
export interface NarrativeResult { narrative?: Narrative; error?: string; }

const k = (n: string) => (process.env[n] && (process.env[n] as string).length > 8 ? (process.env[n] as string) : null);
export function hasGeminiKey(): boolean { return !!k("GEMINI_API_KEY"); }
export function hasAnthropicProviderKey(): boolean { return !!k("ANTHROPIC_API_KEY"); }
export function hasAnthropicKey(): boolean { return hasGeminiKey() || hasAnthropicProviderKey(); }

const SYSTEM =
  "You are an equity-research assistant for an EDUCATIONAL valuation tool. Using ONLY the numbers provided, " +
  "write a bull case, a base case, and a bear case. Each must be 2-4 sentences and cite specific numbers " +
  "(fair value, margin of safety, reverse-DCF growth, method ranges, scorecard factors). Be balanced; never give " +
  'a buy/sell recommendation. Respond with ONLY valid JSON: {"bull":"...","base":"...","bear":"..."}';

function buildPrompt(i: NarrativeInput): string {
  const f = (n: number | null, d = 2) => (n == null || !isFinite(n) ? "n/a" : n.toFixed(d));
  const methods = i.methods.map((m) => `- ${m.label}: ${m.range} (vs price: ${m.gapVsPrice})`).join("\n");
  const factors = i.scorecard.factors.map((x) => `- ${x.label}: ${x.value}`).join("\n");
  return [
    `Company: ${i.name} (${i.symbol}), sector ${i.sector || "n/a"}.`,
    `Current price: ${i.currency} ${f(i.price)}.`,
    `Blended intrinsic fair value: ${i.blendedFairValue == null ? "n/a" : i.currency + " " + f(i.blendedFairValue)}.`,
    `Margin of safety vs price: ${i.marginOfSafety == null ? "n/a" : (i.marginOfSafety * 100).toFixed(1) + "%"}.`,
    `Reverse-DCF implied annual FCF growth: ${i.reverseImpliedGrowth == null ? "n/a" : (i.reverseImpliedGrowth * 100).toFixed(1) + "%"}.`,
    ``, `Valuation methods:`, methods || "- none available",
    ``, `Conditions scorecard: ${i.scorecard.label} (${i.scorecard.composite == null ? "n/a" : i.scorecard.composite.toFixed(0)}/100).`,
    factors, ``, `Market Fear & Greed (contrarian): ${i.fearGreed}.`, `Retail buzz: ${i.buzz}.`,
    `Congressional trades: ${i.congressSummary}.`, `Recent headlines:`, ...i.headlines.slice(0, 6).map((h) => `- ${h}`),
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

export async function generateNarrative(i: NarrativeInput): Promise<NarrativeResult> {
  if (hasGeminiKey()) return geminiNarrative(i);
  if (hasAnthropicProviderKey()) return anthropicNarrative(i);
  return { error: "No narrative API key configured (set GEMINI_API_KEY)." };
}

async function geminiNarrative(i: NarrativeInput): Promise<NarrativeResult> {
  const wanted = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const models = Array.from(new Set([wanted, "gemini-1.5-flash", "gemini-flash-latest"]));
  const prompt = SYSTEM + "\n\n" + buildPrompt(i);
  let lastErr = "Gemini request failed.";
  for (const model of models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${k("GEMINI_API_KEY")}`, {
        method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 1024 } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        lastErr = `Gemini ${res.status}: ${data?.error?.message || "request rejected"}`.slice(0, 200);
        if (res.status === 404 || res.status === 400) continue; // try next model id
        return { error: lastErr };
      }
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = safeParse(text);
      if (parsed) return { narrative: { ...parsed, generatedAt: new Date().toISOString(), model: `gemini:${model}` } };
      lastErr = "Gemini returned a response the app couldn't parse into bull/base/bear.";
    } catch {
      lastErr = "Gemini request timed out.";
    } finally { clearTimeout(timer); }
  }
  return { error: lastErr };
}

async function anthropicNarrative(i: NarrativeInput): Promise<NarrativeResult> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": k("ANTHROPIC_API_KEY") as string, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, messages: [{ role: "user", content: buildPrompt(i) }] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: `Anthropic ${res.status}: ${data?.error?.message || "request rejected"}`.slice(0, 200) };
    const parsed = safeParse(data?.content?.[0]?.text ?? "");
    return parsed ? { narrative: { ...parsed, generatedAt: new Date().toISOString(), model } } : { error: "Anthropic response unparseable." };
  } catch { return { error: "Anthropic request timed out." }; } finally { clearTimeout(timer); }
}
