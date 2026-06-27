// Lazy path: the bull/base/bear narrative from Anthropic. Called from the client
// AFTER the numbers render, so the slow AI step never blocks the page. Own 10s budget.
import { NextRequest, NextResponse } from "next/server";
import { generateNarrative, hasAnthropicKey, type NarrativeInput } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json({ error: "Narrative unavailable: set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY." }, { status: 503 });
  }
  let input: NarrativeInput;
  try {
    input = (await req.json()) as NarrativeInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!input?.symbol) return NextResponse.json({ error: "Missing narrative input." }, { status: 400 });

  const narrative = await generateNarrative(input);
  if (!narrative) return NextResponse.json({ error: "Narrative generation failed." }, { status: 502 });
  return NextResponse.json(narrative);
}
