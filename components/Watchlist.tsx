"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY = "vs:watchlist";

export default function Watchlist({ current }: { current?: string }) {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try { const r = localStorage.getItem(KEY); if (r) setList(JSON.parse(r)); } catch {}
    setReady(true);
  }, []);

  const save = (l: string[]) => { setList(l); try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {} };
  const add = (s: string) => { const u = s.toUpperCase(); if (!u || list.includes(u)) return; save([...list, u]); };
  const remove = (s: string) => save(list.filter((x) => x !== s));
  const saved = current ? list.includes(current.toUpperCase()) : false;

  if (!ready) return <div className="watch no-print" />;

  return (
    <div className="watch no-print">
      <div className="chips">
        {list.map((s) => (
          <span className="chip" key={s}>
            <span onClick={() => router.push(`/ticker/${s}`)} style={{ cursor: "pointer" }}>{s}</span>
            <span className="x" role="button" aria-label={`Remove ${s}`} onClick={() => remove(s)}>✕</span>
          </span>
        ))}
        {current && !saved && <button className="chip add" onClick={() => add(current)}>+ Save {current.toUpperCase()}</button>}
        {list.length === 0 && !current && <span className="muted small">No saved tickers yet — analyze one, then save it.</span>}
      </div>
    </div>
  );
}
