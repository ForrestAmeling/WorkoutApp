"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DateStrip } from "@/components/DateStrip";
import { DayPicker } from "@/components/DayPicker";
import { ExerciseCard } from "@/components/ExerciseCard";
import { RestTimer } from "@/components/RestTimer";
import { useSettings } from "@/components/SettingsProvider";
import { formatWeight } from "@/lib/units";
import { nextPosition, todayISO, WEEK_LABELS } from "@/lib/program";
import type { PeriodizationMode } from "@/lib/periodization";
import type {
  ExerciseWithTarget,
  RoutineDay,
  SetLog,
  WeekFocus,
} from "@/lib/types";

type WakeLockSentinel = { release: () => Promise<void> };

export function WorkoutSession({
  title,
  routineName,
  days,
  weekFocus,
  dayNumber,
  usesPeriodization,
  periodizationMode,
  sessionId,
  cycleId,
  routineId,
  performedOn,
  initialExercises,
}: {
  title: string;
  routineName: string;
  days: RoutineDay[];
  weekFocus: WeekFocus;
  dayNumber: number;
  usesPeriodization: boolean;
  periodizationMode: PeriodizationMode;
  sessionId: string | null;
  cycleId: string | null;
  routineId: string;
  performedOn: string;
  initialExercises: ExerciseWithTarget[];
}) {
  const router = useRouter();
  const { settings } = useSettings();
  const [exercises, setExercises] = useState(initialExercises);
  const [openId, setOpenId] = useState<string | null>(
    initialExercises.find((e) => e.sets.length < e.target.target_sets)?.id ??
      null
  );
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [dismissedComplete, setDismissedComplete] = useState(false);

  useEffect(() => {
    setExercises(initialExercises);
    setOpenId(
      initialExercises.find((e) => e.sets.length < e.target.target_sets)?.id ??
        null
    );
    setDismissedComplete(false);
  }, [initialExercises, performedOn, weekFocus, dayNumber]);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          lock = await (
            navigator as Navigator & {
              wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> };
            }
          ).wakeLock.request("screen");
        }
      } catch {
        // Browser may deny while the tab is in the background.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  const completedSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const targetSets = exercises.reduce((n, e) => n + e.target.target_sets, 0);
  const allTargetsMet =
    exercises.length > 0 &&
    exercises.every((e) => e.sets.length >= e.target.target_sets);
  const volume = exercises.reduce(
    (n, e) =>
      n +
      e.sets.reduce(
        (s, set) => s + Number(set.weight ?? 0) * Number(set.reps ?? 0),
        0
      ),
    0
  );

  // Is this the last day of the current block (e.g. day 5 of a 5-day
  // Light/Middle/Heavy focus)? If so, "done" means the whole block is done,
  // not just today — that's when we offer to jump straight into what's next
  // instead of the usual plain "Workout complete".
  const maxDay = days.length || 1;
  const isLastDayOfBlock = dayNumber >= maxDay;
  const showFocusLabel = periodizationMode !== "none";
  const nextStop = isLastDayOfBlock
    ? periodizationMode === "full"
      ? nextPosition(weekFocus, dayNumber, maxDay)
      : { weekFocus, dayNumber: 1 }
    : null;
  const nextStopName = nextStop
    ? days.find((d) => d.day_number === nextStop.dayNumber)?.name ??
      `Day ${nextStop.dayNumber}`
    : null;

  // Auto-advance to the next incomplete exercise, but only at the moment the
  // exercise the user is actively logging just hits its set target — not as
  // a standing rule re-applied on every render. Doing it here (inside the
  // update triggered by an actual logged/edited/deleted set) instead of a
  // useEffect keyed on [exercises, openId] means manually reopening an
  // already-completed exercise (tapping its header) doesn't get immediately
  // reverted: that reopen only changes openId, it doesn't call onSetsChange,
  // so this logic simply doesn't run and the user's choice sticks — letting
  // them add an extra set to *any* finished exercise, not just whichever one
  // happened to still be open when the last target was hit.
  const onSetsChange = useCallback(
    (exerciseId: string, sets: SetLog[]) => {
      setExercises((prev) => {
        const next = prev.map((e) => (e.id === exerciseId ? { ...e, sets } : e));
        const changed = next.find((e) => e.id === exerciseId);
        if (
          openId === exerciseId &&
          changed &&
          changed.sets.length >= changed.target.target_sets
        ) {
          const nextIncomplete = next.find(
            (e) => e.sets.length < e.target.target_sets
          );
          if (nextIncomplete) setOpenId(nextIncomplete.id);
        }
        return next;
      });
    },
    [openId]
  );

  const onLogged = useCallback(() => {
    setRestEndsAt(Date.now() + settings.restSeconds * 1000);
  }, [settings.restSeconds]);

  return (
    <div className="space-y-5">
      <header className="animate-rise">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {routineName}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {completedSets}/{targetSets} sets · {formatWeight(volume, settings.unit)}{" "}
          volume
          {performedOn !== todayISO()
            ? allTargetsMet
              ? " · completed"
              : " · logging a past day"
            : ""}
        </p>
      </header>

      <DateStrip performedOn={performedOn} />

      <DayPicker
        weekFocus={weekFocus}
        dayNumber={dayNumber}
        days={days}
        usesPeriodization={usesPeriodization}
      />

      {allTargetsMet && !dismissedComplete && (
        <section className="rounded-2xl bg-[var(--accent-soft)] px-4 py-4 ring-1 ring-[var(--accent)]">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
            {isLastDayOfBlock
              ? showFocusLabel
                ? `${WEEK_LABELS[weekFocus]} block complete! 🎉`
                : "Block complete! 🎉"
              : "Workout complete"}
          </h2>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {completedSets} sets · {formatWeight(volume, settings.unit)} volume.
            {isLastDayOfBlock
              ? ` That's all ${maxDay} day${maxDay === 1 ? "" : "s"}${
                  showFocusLabel ? ` of ${WEEK_LABELS[weekFocus]}` : ""
                } done.`
              : " Extra sets still count if you want them."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {isLastDayOfBlock && nextStop && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    periodizationMode === "full"
                      ? `/today?week=${nextStop.weekFocus}&day=${nextStop.dayNumber}&reset=1`
                      : `/today?day=${nextStop.dayNumber}&reset=1`
                  )
                }
                className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)]"
              >
                Reset — Start{" "}
                {periodizationMode === "full"
                  ? `${WEEK_LABELS[nextStop.weekFocus]} · `
                  : ""}
                {nextStopName}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedComplete(true)}
              className="text-sm font-semibold text-[var(--accent-text)]"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {exercises.map((ex, i) => (
          <div
            key={ex.id}
            className="animate-rise"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <ExerciseCard
              exercise={ex}
              sessionId={sessionId}
              weekFocus={weekFocus}
              dayNumber={dayNumber}
              routineId={routineId}
              cycleId={cycleId}
              performedOn={performedOn}
              open={openId === ex.id}
              onOpenChange={(next) => setOpenId(next ? ex.id : null)}
              onSetsChange={onSetsChange}
              onLogged={onLogged}
              onReplaced={(id, patch) =>
                setExercises((prev) =>
                  prev.map((item) =>
                    item.id === id ? { ...item, ...patch } : item
                  )
                )
              }
            />
          </div>
        ))}
        {exercises.length === 0 && (
          <p className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
            No exercises on this day.{" "}
            <a
              href={`/routines/${routineId}`}
              className="font-semibold underline"
            >
              Customize routine
            </a>
          </p>
        )}
      </div>

      <RestTimer endsAt={restEndsAt} onDone={() => setRestEndsAt(null)} />
    </div>
  );
}
