"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TickerSearch({ autoFocus, placeholder }: { autoFocus?: boolean; placeholder?: string }) {
  const [v, setV] = useState("");
  const router = useRouter();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = v.trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
    if (s) router.push(`/ticker/${s}`);
  };
  return (
    <form className="search-wrap" onSubmit={go}>
      <input className="input" autoFocus={autoFocus} value={v} onChange={(e) => setV(e.target.value)}
        placeholder={placeholder || "Enter a ticker, e.g. AAPL"} aria-label="Ticker symbol" maxLength={9} />
      <button className="btn btn-primary" type="submit">Analyze</button>
    </form>
  );
}
