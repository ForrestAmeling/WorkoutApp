"use client";

import { useCallback, useEffect, useState } from "react";
import { DateStrip } from "@/components/DateStrip";
import { DayPicker } from "@/components/DayPicker";
import { ExerciseCard } from "@/components/ExerciseCard";
import { RestTimer } from "@/components/RestTimer";
import { useSettings } from "@/components/SettingsProvider";
import { formatWeight } from "@/lib/units";
import { todayISO } from "@/lib/program";
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
  sessionId: string | null;
  cycleId: string | null;
  routineId: string;
  performedOn: string;
  initialExercises: ExerciseWithTarget[];
}) {
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

  const onSetsChange = useCallback((exerciseId: string, sets: SetLog[]) => {
    setExercises((prev) =>
      prev.map((e) => (e.id === exerciseId ? { ...e, sets } : e))
    );
  }, []);

  const onLogged = useCallback(() => {
    setRestEndsAt(Date.now() + settings.restSeconds * 1000);
  }, [settings.restSeconds]);

  useEffect(() => {
    if (!openId) return;
    const current = exercises.find((e) => e.id === openId);
    if (!current || current.sets.length < current.target.target_sets) return;
    const next = exercises.find((e) => e.sets.length < e.target.target_sets);
    if (next) setOpenId(next.id);
  }, [exercises, openId]);

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
          {performedOn !== todayISO() ? " · logging a past day" : ""}
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
            Workout complete
          </h2>
          <p className="mt-1 text-sm text-[var(--ink)]">
            {completedSets} sets · {formatWeight(volume, settings.unit)} volume.
            Extra sets still count if you want them.
          </p>
          <button
            type="button"
            onClick={() => setDismissedComplete(true)}
            className="mt-3 text-sm font-semibold text-[var(--accent-text)]"
          >
            Dismiss
          </button>
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
