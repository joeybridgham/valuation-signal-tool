// Lazy path: bull/base/bear narrative. Returns 200 with the narrative, or 200
// with {error} carrying the upstream reason (so the UI shows what happened and
// failures don't inflate the function error rate).
import { NextRequest, NextResponse } from "next/server";
import { generateNarrative, type NarrativeInput } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let input: NarrativeInput;
  try { input = (await req.json()) as NarrativeInput; }
  catch { return NextResponse.json({ error: "Invalid request body." }); }
  if (!input?.symbol) return NextResponse.json({ error: "Missing narrative input." });

  const res = await generateNarrative(input);
  if (res.narrative) return NextResponse.json(res.narrative);
  return NextResponse.json({ error: res.error || "Narrative unavailable." });
}
