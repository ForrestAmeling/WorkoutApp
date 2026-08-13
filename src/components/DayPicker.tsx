"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { WEEK_FOCI, WEEK_LABELS } from "@/lib/program";
import type { RoutineDay, WeekFocus } from "@/lib/types";

export function DayPicker({
  weekFocus,
  dayNumber,
  days,
  usesPeriodization,
}: {
  weekFocus: WeekFocus;
  dayNumber: number;
  days: RoutineDay[];
  usesPeriodization: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(nextWeek: WeekFocus, nextDay: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (usesPeriodization) params.set("week", nextWeek);
    else params.delete("week");
    params.set("day", String(nextDay));
    router.push(`/today?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {usesPeriodization && (
        <div className="flex gap-2">
          {WEEK_FOCI.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => update(w, dayNumber)}
              className={`min-h-11 flex-1 rounded-xl text-sm font-semibold transition ${
                w === weekFocus
                  ? "bg-[var(--solid)] text-[var(--on-solid)] shadow-sm"
                  : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
              }`}
            >
              {WEEK_LABELS[w]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => update(weekFocus, d.day_number)}
            className={`min-h-12 min-w-[3.25rem] flex-1 rounded-xl px-2 text-sm font-bold transition ${
              d.day_number === dayNumber
                ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>
    </div>
  );
}
