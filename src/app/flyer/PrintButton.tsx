"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flyer-no-print min-h-12 rounded-xl bg-[#d6ff3f] px-6 text-sm font-extrabold tracking-wide text-[#14201c]"
    >
      Print flyer
    </button>
  );
}
