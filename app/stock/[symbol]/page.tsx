import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AnalysisView from "@/components/AnalysisView";
import { getAnalysis } from "@/lib/analyze";
import { FEATURED_SYMBOLS, featuredBySymbol } from "@/lib/featured";
import { computeValuation } from "@/lib/valuation";
import { computeScorecard, DEFAULT_WEIGHTS } from "@/lib/scorecard";
import { technicalSnapshot } from "@/lib/technicals";
import { buildNarrativeInput } from "@/lib/narrativeInput";
import { generateNarrative, hasAnthropicKey } from "@/lib/anthropic";
import { getSampleNarrative } from "@/lib/sampleData";
import type { Narrative } from "@/lib/types";

// Statically generate the four featured tickers; revalidate once a day (ISR).
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURED_SYMBOLS.map((symbol) => ({ symbol }));
}

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  const f = featuredBySymbol(params.symbol);
  return { title: f ? `${f.symbol} — ${f.name} · Valuation & Signal` : "Valuation & Signal" };
}

export default async function FeaturedPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  const data = await getAnalysis(symbol);
  if (!data) notFound();

  // Pre-generate the narrative at build time so featured pages load complete.
  const val = computeValuation(data, data.defaults);
  const tech = technicalSnapshot(data.priceSeries);
  const score = computeScorecard(data, val, tech, DEFAULT_WEIGHTS);

  let narrative: Narrative | null = null;
  if (data.meta.isSample) {
    narrative = getSampleNarrative(symbol);
  } else if (hasAnthropicKey()) {
    narrative = await generateNarrative(buildNarrativeInput(data, val, score));
  }

  return <AnalysisView data={data} initialNarrative={narrative} live={false} />;
}
