"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalyzeResult } from "@/lib/types";
import AnalysisView from "@/components/AnalysisView";
import { FEATURED } from "@/lib/featured";

export default function LiveTickerPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const [data, setData] = useState<AnalyzeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setData(null); setErr(null);
    fetch(`/api/analyze?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Lookup failed."); return j; })
      .then((d) => { if (!cancel) setData(d as AnalyzeResult); })
      .catch((e) => { if (!cancel) setErr(String(e.message || e)); });
    return () => { cancel = true; };
  }, [symbol]);

  if (err) {
    return (
      <div className="card pad-lg" style={{ marginTop: 20 }}>
        <div className="eyebrow">{symbol}</div>
        <h2 className="h2" style={{ margin: "6px 0" }}>Couldn't load that ticker</h2>
        <p className="muted">{err}</p>
        <div className="chips" style={{ marginTop: 14 }}>
          {FEATURED.map((f) => <Link key={f.symbol} className="chip" href={`/stock/${f.symbol}`}>{f.symbol}</Link>)}
          <Link className="chip add" href="/">← Home</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="stack" style={{ gap: 18, marginTop: 20 }}>
        <div className="row center" style={{ gap: 10 }}>
          <span className="spinner" /><span className="muted">Analyzing <strong>{symbol}</strong>, fetching fundamentals, prices, peers, signals…</span>
        </div>
        <div className="skeleton" style={{ height: 90 }} />
        <div className="grid grid-5-2">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  return <AnalysisView data={data} live />;
}
