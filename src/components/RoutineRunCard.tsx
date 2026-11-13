"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  defaultWeekFocus,
  positionLabel,
  type PeriodizationMode,
} from "@/lib/periodization";
import { formatHumanDate, todayISO } from "@/lib/program";
import type { RoutineDay, WeekFocus } from "@/lib/types";
import type { RunSummary } from "@/lib/workout";

function dayName(days: RoutineDay[], dayNumber: number) {
  return days.find((d) => d.day_number === dayNumber)?.name ?? `Day ${dayNumber}`;
}

function shortDate(iso: string) {
  return formatHumanDate(iso, { month: "short", day: "numeric", year: "numeric" });
}

/** POST /api/routines/[id]/restart — shared with the Today welcome-back banner. */
export async function restartRoutine(routineId: string, activate: boolean) {
  const res = await fetch(`/api/routines/${routineId}/restart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activate, today: todayISO() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Restart failed");
}

export function RoutineRunCard({
  routineId,
  mode,
  days,
  open,
  past,
  next,
}: {
  routineId: string;
  mode: PeriodizationMode;
  days: RoutineDay[];
  open: RunSummary | null;
  past: RunSummary[];
  next: { weekFocus: WeekFocus; dayNumber: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startLabel = positionLabel(mode, defaultWeekFocus(mode), dayName(days, 1));
  const nextLabel = positionLabel(mode, next.weekFocus, dayName(days, next.dayNumber));
  const inProgress = open !== null && open.workouts > 0;
  const runNumber = past.length + 1;

  async function run(activate: boolean) {
    const prompt = activate
      ? `Start this routine over at ${startLabel}? Your logged workouts stay in History and still count toward weight suggestions.`
      : "Close this run? Your logged workouts stay in History and still count toward weight suggestions. Next time you log this routine it starts at the beginning.";
    if (!confirm(prompt)) return;
    setBusy(true);
    setError(null);
    try {
      await restartRoutine(routineId, activate);
      if (activate) router.push("/today");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restart failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]">
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
        {inProgress
          ? `Run ${runNumber} in progress`
          : past.length > 0
            ? `Run ${runNumber} not started yet`
            : "Not started"}
      </h2>
      {inProgress && open ? (
        <p className="mt-1 text-sm text-[var(--muted)]">
          Started {shortDate(open.startedOn)} · {open.workouts} workout
          {open.workouts === 1 ? "" : "s"}
          {open.lastPerformedOn ? ` · last ${shortDate(open.lastPerformedOn)}` : ""}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--ink)]">
        {inProgress ? "Next up: " : "Begins at "}
        <span className="font-semibold">{inProgress ? nextLabel : startLabel}</span>
      </p>

      {inProgress ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(true)}
            className="min-h-11 rounded-xl bg-[var(--solid)] px-4 text-sm font-bold text-[var(--on-solid)] disabled:opacity-60"
          >
            {busy ? "Working…" : `Restart from ${startLabel}`}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(false)}
            className="text-sm font-semibold text-[var(--muted)] disabled:opacity-60"
          >
            Close run
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {past.length > 0 ? (
        <div className="mt-4 border-t border-[var(--stroke)] pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Past runs
          </h3>
          <ul className="mt-2 space-y-1.5">
            {past.map((r, i) => (
              <li key={r.id} className="text-sm text-[var(--ink)]">
                <span className="font-semibold">Run {past.length - i}</span>
                <span className="text-[var(--muted)]">
                  {" "}
                  · {shortDate(r.startedOn)} – {shortDate(r.closedOn!)} ·{" "}
                  {r.workouts} workout{r.workouts === 1 ? "" : "s"}
                  {r.lastPosition
                    ? ` · reached ${positionLabel(
                        mode,
                        r.lastPosition.weekFocus,
                        dayName(days, r.lastPosition.dayNumber)
                      )}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
