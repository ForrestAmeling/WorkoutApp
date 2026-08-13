"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatHumanDate, shiftISODate, todayISO } from "@/lib/program";

export function DateStrip({ performedOn }: { performedOn: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayISO();

  function go(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete("date");
    else params.set("date", next);
    const q = params.toString();
    router.push(q ? `/today?${q}` : "/today");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(shiftISODate(performedOn, -1))}
        className="min-h-11 min-w-11 rounded-xl bg-[var(--card)] text-lg font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
        aria-label="Previous day"
      >
        ‹
      </button>
      <div className="min-h-11 flex-1 rounded-xl bg-[var(--card)] px-3 py-2 text-center ring-1 ring-[var(--stroke)]">
        <p className="text-sm font-bold text-[var(--ink)]">
          {formatHumanDate(performedOn)}
        </p>
        {performedOn !== today && (
          <button
            type="button"
            onClick={() => go(today)}
            className="text-xs font-semibold text-[var(--accent-text)]"
          >
            Jump to today
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => go(shiftISODate(performedOn, 1))}
        disabled={performedOn >= today}
        className="min-h-11 min-w-11 rounded-xl bg-[var(--card)] text-lg font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] disabled:opacity-30"
        aria-label="Next day"
      >
        ›
      </button>
    </div>
  );
}
