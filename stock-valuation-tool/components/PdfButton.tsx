"use client";
export default function PdfButton() {
  return (
    <button className="btn no-print" onClick={() => window.print()} title="Save / print a one-page report">
      ⤓ Download PDF
    </button>
  );
}
