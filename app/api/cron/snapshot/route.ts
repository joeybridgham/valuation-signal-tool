// Daily snapshot job. Vercel Cron calls this once a day (see vercel.json) and
// sends Authorization: Bearer $CRON_SECRET automatically. It records each
// tracked ticker's Reddit mention count into a time series, and (if Reddit
// creds are set) caches the top 2 posts per ticker. No store? It no-ops.
import { NextRequest, NextResponse } from "next/server";
import { hasStore, kvPipeline, kvSet } from "@/lib/store";
import { hasRedditCreds, topPosts } from "@/lib/reddit";
import { getJson } from "@/lib/http";
import { FEATURED } from "@/lib/featured";
import type { MentionPoint } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;
const APE = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasStore()) return NextResponse.json({ ok: false, reason: "no store configured" });

  const today = new Date().toISOString().slice(0, 10);
  const [p1, p2] = await Promise.all([
    getJson<any>(`${APE}1`, { revalidate: 0, timeoutMs: 6000 }),
    getJson<any>(`${APE}2`, { revalidate: 0, timeoutMs: 6000 }),
  ]);
  const rows = [...(p1?.results ?? []), ...(p2?.results ?? [])];
  const map = new Map<string, any>();
  for (const r of rows) if (r?.ticker) map.set(String(r.ticker).toUpperCase(), r);

  const tracked = Array.from(new Set([...FEATURED.map((f) => f.symbol), ...Array.from(map.keys()).slice(0, 60)]));

  // read existing series, append today's snapshot, write back
  const existing = await kvPipeline(tracked.map((s) => ["GET", `mentions:${s}`]));
  const setCmds: string[][] = [];
  tracked.forEach((sym, i) => {
    let series: MentionPoint[] = [];
    try { if (existing[i]) series = JSON.parse(existing[i] as string); } catch {}
    const r = map.get(sym);
    series = series.filter((x) => x.date !== today);
    series.push({ date: today, mentions: r ? Number(r.mentions) || 0 : 0, rank: r ? Number(r.rank) || null : null, upvotes: r ? Number(r.upvotes) || 0 : 0 });
    if (series.length > 220) series = series.slice(-220);
    setCmds.push(["SET", `mentions:${sym}`, JSON.stringify(series)]);
  });
  await kvPipeline(setCmds);

  // cache Reddit posts for featured + a few top names (kept small for the time budget)
  let redditUpdated = 0;
  if (hasRedditCreds()) {
    const targets = Array.from(new Set([...FEATURED.map((f) => f.symbol), ...Array.from(map.keys()).slice(0, 8)])).slice(0, 12);
    for (const sym of targets) {
      const posts = await topPosts(sym, 2);
      if (posts.length) { await kvSet(`posts:${sym}`, posts); redditUpdated++; }
    }
  }
  return NextResponse.json({ ok: true, date: today, tracked: tracked.length, redditUpdated });
}
