import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AnalysisView from "@/components/AnalysisView";
import { getAnalysis } from "@/lib/analyze";
import { FEATURED_SYMBOLS, featuredBySymbol } from "@/lib/featured";
import { computeValuation } from "@/lib/valuation";
import { computeScorecard, DEFAULT_WEIGHTS } from "@/lib/scorecard";
import { technicalSnapshot } from "@/lib/technicals";
import { buildNarrativeInput } from "@/lib/narrativeInput";
import { generateNarrative } from "@/lib/anthropic";
import { getSampleNarrative } from "@/lib/sampleData";
import type { Narrative } from "@/lib/types";

// On-demand + cached daily (NOT pre-built) — avoids spending the FMP daily
// budget on every deploy. First visit generates and caches for 24h.
export const revalidate = 86400;

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  const f = featuredBySymbol(params.symbol);
  return { title: f ? `${f.symbol} — ${f.name} · Valuation & Signal` : "Valuation & Signal" };
}

export default async function FeaturedPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  if (!FEATURED_SYMBOLS.includes(symbol)) notFound();

  const data = await getAnalysis(symbol);
  if (!data) notFound();

  const val = computeValuation(data, data.defaults);
  const tech = technicalSnapshot(data.priceSeries);
  const score = computeScorecard(data, val, tech, DEFAULT_WEIGHTS);

  let narrative: Narrative | null = null;
  if (data.meta.isSample) {
    narrative = getSampleNarrative(symbol);
  } else {
    const r = await generateNarrative(buildNarrativeInput(data, val, score));
    narrative = r.narrative ?? null;
  }
  return <AnalysisView data={data} initialNarrative={narrative} live={false} />;
}
