// Fast path: FMP + ApeWisdom + CNN + valuation inputs. Must stay well under 10s.
// Returns the full raw-input payload so the client recomputes everything locally.
import { NextRequest, NextResponse } from "next/server";
import { getAnalysis } from "@/lib/analyze";
import { hasFmpKey } from "@/lib/fmp";

export const runtime = "nodejs";
export const maxDuration = 10; // Hobby-tier cap

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!/^[A-Z][A-Z.\-]{0,8}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker (letters only)." }, { status: 400 });
  }
  try {
    const data = await getAnalysis(symbol);
    if (!data) {
      if (!hasFmpKey()) {
        return NextResponse.json(
          { error: "Live lookup needs FMP_API_KEY. The featured tickers (SLS, META, UNH, HAL) work without it." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: `No data found for "${symbol}".` }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Analysis failed — please try again." }, { status: 500 });
  }
}
