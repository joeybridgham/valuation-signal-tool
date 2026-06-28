// ============================================================================
// AI provider chain (Gemini -> Groq -> OpenRouter -> Anthropic). One runChain()
// returns raw text from the first working provider; both the bull/base/bear
// narrative AND the last-resort AI data snapshot reuse it. All free-tier
// friendly (Anthropic is the paid option).
// ============================================================================
import type { Narrative } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

export interface NarrativeInput {
  symbol: string; name: string; sector: string; price: number; currency: string;
  blendedFairValue: number | null; marginOfSafety: number | null; reverseImpliedGrowth: number | null;
  methods: { label: string; range: string; gapVsPrice: string }[];
  scorecard: { label: string; composite: number | null; factors: { label: string; value: string }[] };
  fearGreed: string; buzz: string; congressSummary: string; headlines: string[];
}
export interface NarrativeResult { narrative?: Narrative; error?: string; }
export interface ChatResult { text?: string; error?: string; model?: string; }

const k = (n: string) => (process.env[n] && (process.env[n] as string).length > 8 ? (process.env[n] as string) : null);
export function hasGeminiKey() { return !!k("GEMINI_API_KEY"); }
export function hasGroqKey() { return !!k("GROQ_API_KEY"); }
export function hasOpenRouterKey() { return !!k("OPENROUTER_API_KEY"); }
export function hasAnthropicProviderKey() { return !!k("ANTHROPIC_API_KEY"); }
export function hasAnyAiKey() { return hasGeminiKey() || hasGroqKey() || hasOpenRouterKey() || hasAnthropicProviderKey(); }
export const hasAnthropicKey = hasAnyAiKey; // back-compat name

export function safeParse(text: string) {
  try { const m = text.match(/\{[\s\S]*\}/); if (!m) return null; return JSON.parse(m[0]); } catch { return null; }
}

// ---- single provider chain returning raw text ----
export async function runChain(system: string, user: string): Promise<ChatResult> {
  const chain: (() => Promise<ChatResult>)[] = [];
  if (hasGeminiKey()) chain.push(() => geminiText(system, user));
  if (hasGroqKey()) chain.push(() => oaiText("groq", GROQ_ENDPOINT, process.env.GROQ_MODEL || "llama-3.3-70b-versatile", k("GROQ_API_KEY") as string, system, user));
  if (hasOpenRouterKey()) chain.push(() => oaiText("openrouter", OPENROUTER_ENDPOINT, process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", k("OPENROUTER_API_KEY") as string, system, user, { "HTTP-Referer": "https://valuation-signal-tool.vercel.app", "X-Title": "Valuation & Signal" }));
  if (hasAnthropicProviderKey()) chain.push(() => anthropicText(system, user));
  if (!chain.length) return { error: "No AI key configured (set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY)." };
  let firstErr = "";
  for (const run of chain) { const r = await run(); if (r.text) return r; if (r.error && !firstErr) firstErr = r.error; }
  return { error: firstErr || "All AI providers failed." };
}
export const aiChat = runChain;

async function oaiText(name: string, endpoint: string, model: string, apiKey: string, system: string, user: string, extra: Record<string, string> = {}): Promise<ChatResult> {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(endpoint, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}`, ...extra },
      body: JSON.stringify({ model, temperature: 0.5, max_tokens: 1024, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: `${name} ${res.status}: ${data?.error?.message || "rejected"}`.slice(0, 200) };
    const text = data?.choices?.[0]?.message?.content; return text ? { text, model: `${name}:${model}` } : { error: `${name} empty response.` };
  } catch { return { error: `${name} timed out.` }; } finally { clearTimeout(timer); }
}
async function geminiText(system: string, user: string): Promise<ChatResult> {
  const models = Array.from(new Set([process.env.GEMINI_MODEL || "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"]));
  let lastErr = "Gemini failed.";
  for (const model of models) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${k("GEMINI_API_KEY")}`, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: system + "\n\n" + user }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { lastErr = `Gemini ${res.status}: ${data?.error?.message || "rejected"}`.slice(0, 200); if (res.status === 404 || res.status === 400) continue; return { error: lastErr }; }
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text; if (text) return { text, model: `gemini:${model}` }; lastErr = "Gemini empty response.";
    } catch { lastErr = "Gemini timed out."; } finally { clearTimeout(timer); }
  }
  return { error: lastErr };
}
async function anthropicText(system: string, user: string): Promise<ChatResult> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json", "x-api-key": k("ANTHROPIC_API_KEY") as string, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: "user", content: user }] }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: `Anthropic ${res.status}: ${data?.error?.message || "rejected"}`.slice(0, 200) };
    const text = data?.content?.[0]?.text; return text ? { text, model } : { error: "Anthropic empty." };
  } catch { return { error: "Anthropic timed out." }; } finally { clearTimeout(timer); }
}

// ---- narrative (uses the chain) ----
const NARRATIVE_SYSTEM =
  "You are an equity-research assistant for an EDUCATIONAL valuation tool. Using ONLY the numbers provided, write a bull case, " +
  "a base case, and a bear case. Each 2-4 sentences, citing specific numbers (fair value, margin of safety, reverse-DCF growth, " +
  'method ranges, scorecard factors). Be balanced; never give a buy/sell recommendation. Respond with ONLY JSON: {"bull":"...","base":"...","bear":"..."}';
function narrativePrompt(i: NarrativeInput): string {
  const f = (n: number | null, d = 2) => (n == null || !isFinite(n) ? "n/a" : n.toFixed(d));
  const methods = i.methods.map((m) => `- ${m.label}: ${m.range} (vs price: ${m.gapVsPrice})`).join("\n");
  const factors = i.scorecard.factors.map((x) => `- ${x.label}: ${x.value}`).join("\n");
  return [`Company: ${i.name} (${i.symbol}), sector ${i.sector || "n/a"}.`, `Price: ${i.currency} ${f(i.price)}.`,
    `Blended fair value: ${i.blendedFairValue == null ? "n/a" : i.currency + " " + f(i.blendedFairValue)}.`,
    `Margin of safety: ${i.marginOfSafety == null ? "n/a" : (i.marginOfSafety * 100).toFixed(1) + "%"}.`,
    `Reverse-DCF growth: ${i.reverseImpliedGrowth == null ? "n/a" : (i.reverseImpliedGrowth * 100).toFixed(1) + "%"}.`,
    ``, `Methods:`, methods || "- none", ``, `Scorecard: ${i.scorecard.label} (${i.scorecard.composite == null ? "n/a" : i.scorecard.composite.toFixed(0)}/100).`,
    factors, ``, `Fear & Greed (contrarian): ${i.fearGreed}.`, `Retail buzz: ${i.buzz}.`, `Congress: ${i.congressSummary}.`,
    `Headlines:`, ...i.headlines.slice(0, 6).map((h) => `- ${h}`)].join("\n");
}
export async function generateNarrative(i: NarrativeInput): Promise<NarrativeResult> {
  const r = await runChain(NARRATIVE_SYSTEM, narrativePrompt(i));
  if (!r.text) return { error: r.error || "Narrative unavailable." };
  const o = safeParse(r.text);
  if (o && o.bull && o.base && o.bear) return { narrative: { bull: String(o.bull), base: String(o.base), bear: String(o.bear), generatedAt: new Date().toISOString(), model: r.model || "ai" } };
  return { error: "AI returned an unparseable narrative." };
}
