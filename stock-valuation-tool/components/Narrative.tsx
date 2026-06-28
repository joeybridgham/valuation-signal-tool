"use client";
import type { Narrative } from "@/lib/types";

export default function NarrativePanel({
  narrative, loading, error,
}: { narrative: Narrative | null; loading: boolean; error: string | null }) {
  return (
    <div className="card pad-lg">
      <div className="section-head">
        <div>
          <div className="eyebrow">AI synthesis</div>
          <div className="section-title">Bull · Base · Bear</div>
        </div>
      </div>

      {loading && (
        <div className="narr-grid">
          {["Bull", "Base", "Bear"].map((t) => (
            <div className="narr" key={t}>
              <div className="narr-h">{t}</div>
              <div className="skeleton" style={{ height: 64, marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="empty"><div className="t">Narrative unavailable</div><p className="muted small">{error}</p></div>
      )}

      {!loading && !error && narrative && (
        <div className="narr-grid">
          <Case tone="pos" title="Bull case" text={narrative.bull} />
          <Case tone="warn" title="Base case" text={narrative.base} />
          <Case tone="neg" title="Bear case" text={narrative.bear} />
        </div>
      )}

      <p className="muted small" style={{ marginTop: 12 }}>
        AI-generated synthesis of the public data above. Not investment advice.
        {narrative?.model === "sample" && ", sample text shown until a build with ANTHROPIC_API_KEY generates the real narrative."}
      </p>
    </div>
  );
}

function Case({ tone, title, text }: { tone: string; title: string; text: string }) {
  return (
    <div className={`narr narr-${tone}`}>
      <div className="narr-h">{title}</div>
      <p>{text}</p>
    </div>
  );
}
