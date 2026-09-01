"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatHumanDate, shiftISODate, todayISO } from "@/lib/program";

export function DateStrip({ performedOn }: { performedOn: string }) {
  const searchParams = useSearchParams();
  const today = todayISO();

  function hrefFor(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === today) params.delete("date");
    else params.set("date", next);
    const q = params.toString();
    return q ? `/today?${q}` : "/today";
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={hrefFor(shiftISODate(performedOn, -1))}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--card)] text-lg font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
        aria-label="Previous day"
        prefetch
      >
        ‹
      </Link>
      <div className="min-h-11 flex-1 rounded-xl bg-[var(--card)] px-3 py-2 text-center ring-1 ring-[var(--stroke)]">
        <p className="text-sm font-bold text-[var(--ink)]">
          {formatHumanDate(performedOn)}
        </p>
        {performedOn !== today && (
          <Link
            href={hrefFor(today)}
            className="text-xs font-semibold text-[var(--accent-text)]"
            prefetch
          >
            Jump to today
          </Link>
        )}
      </div>
      {performedOn >= today ? (
        <span
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--card)] text-lg font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] opacity-30"
          aria-disabled="true"
        >
          ›
        </span>
      ) : (
        <Link
          href={hrefFor(shiftISODate(performedOn, 1))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--card)] text-lg font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
          aria-label="Next day"
          prefetch
        >
          ›
        </Link>
      )}
    </div>
  );
}
