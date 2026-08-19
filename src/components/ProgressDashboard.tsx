"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { WEEK_FOCI, WEEK_LABELS } from "@/lib/program";
import {
  filterPointsByFocus,
  isStuckLift,
  weeklyMuscleVolume,
  type AiAccuracy,
  type ExerciseProgress,
} from "@/lib/progress";
import { useSettings } from "@/components/SettingsProvider";
import { formatWeight, lbToDisplay, unitLabel, type WeightUnit } from "@/lib/units";
import type { Routine, WeekFocus } from "@/lib/types";

// recharts (plus its d3 submodules) is a non-trivial chunk of JS that only
// the three chart cards below need — the routine picker, muscle-volume
// bars, and AI-accuracy summary render fine without it. Loading it via
// next/dynamic keeps it out of this route's initial JS payload so the rest
// of the page can paint and become interactive first.
const ExerciseCharts = dynamic(
  () => import("@/components/ExerciseCharts").then((m) => m.ExerciseCharts),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl bg-[var(--card)] px-4 py-10 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
        Loading charts…
      </div>
    ),
  }
);

type FocusFilter = WeekFocus | "all";

type Props = {
  routines: Routine[];
  selectedRoutineId: string | null;
  exercises: ExerciseProgress[];
  aiAccuracy: AiAccuracy;
  weekStart: string;
};

function formatShortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function deltaLabel(delta: number | null, unit: string) {
  if (delta == null || Number.isNaN(delta)) return "—";
  if (delta === 0) return `0 ${unit}`;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} ${unit}`;
}

function exportCsv(exercises: ExerciseProgress[]) {
  const rows = [
    ["date", "exercise", "week", "max_weight_lb", "avg_reps", "sets", "volume"],
  ];
  for (const ex of exercises) {
    for (const p of ex.points) {
      rows.push([
        p.date,
        ex.name,
        p.weekFocus,
        String(p.maxWeight),
        String(p.avgReps),
        String(p.sets),
        String(p.volume),
      ]);
    }
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reps-progress-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProgressDashboard({
  routines,
  selectedRoutineId,
  exercises,
  aiAccuracy,
  weekStart,
}: Props) {
  const router = useRouter();
  const { settings } = useSettings();
  const unit = settings.unit;
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    exercises[0]?.key ?? null
  );

  useEffect(() => {
    if (!exercises.some((e) => e.key === selectedKey)) {
      setSelectedKey(exercises[0]?.key ?? null);
    }
  }, [exercises, selectedKey]);

  const selected =
    exercises.find((e) => e.key === selectedKey) ?? exercises[0] ?? null;

  const chartPoints = useMemo(() => {
    if (!selected) return [];
    return filterPointsByFocus(selected.points, focus).map((p) => ({
      ...p,
      label: formatShortDate(p.date),
    }));
  }, [selected, focus]);

  const filteredSelected = useMemo(() => {
    if (!selected) return null;
    const points = filterPointsByFocus(selected.points, focus);
    if (points.length === 0) {
      return {
        ...selected,
        points,
        startWeight: null,
        latestWeight: null,
        weightDelta: null,
        startReps: null,
        latestReps: null,
        sessionCount: 0,
      };
    }
    const startWeight = points[0].maxWeight;
    const latestWeight = points[points.length - 1].maxWeight;
    const startReps = points[0].avgReps;
    const latestReps = points[points.length - 1].avgReps;
    return {
      ...selected,
      points,
      startWeight,
      latestWeight,
      weightDelta: Math.round((latestWeight - startWeight) * 10) / 10,
      startReps,
      latestReps,
      sessionCount: points.length,
    };
  }, [selected, focus]);

  function onRoutineChange(routineId: string) {
    const url =
      routineId === "all"
        ? "/progress"
        : `/progress?routine=${encodeURIComponent(routineId)}`;
    router.push(url);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Routine
        </label>
        <select
          className="min-h-12 w-full rounded-xl bg-[var(--card)] px-3 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
          value={selectedRoutineId ?? "all"}
          onChange={(e) => onRoutineChange(e.target.value)}
        >
          <option value="all">All routines</option>
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.is_active ? " · Active" : ""}
            </option>
          ))}
        </select>
      </div>

      {exercises.length > 0 && (
        <button
          type="button"
          onClick={() => exportCsv(exercises)}
          className="min-h-11 w-full rounded-xl bg-[var(--card)] text-sm font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
        >
          Export CSV backup
        </button>
      )}

      {exercises.length > 0 && (
        <MuscleAndAi
          exercises={exercises}
          weekStart={weekStart}
          aiAccuracy={aiAccuracy}
          unit={unit}
        />
      )}

      {exercises.length === 0 ? (
        <div className="rounded-2xl bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
          No logged sets yet for this scope. Log workouts from Today and your
          weight and rep trends will show up here.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Exercise
            </label>
            <select
              className="min-h-12 w-full rounded-xl bg-[var(--card)] px-3 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
              value={selected?.key ?? ""}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {exercises.map((ex) => (
                <option key={ex.key} value={ex.key}>
                  Day {ex.dayNumber} · {ex.name}
                  {ex.weightDelta != null && ex.weightDelta !== 0
                    ? ` (${deltaLabel(lbToDisplay(ex.weightDelta, unit), unitLabel(unit))})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "All weeks"],
                ...WEEK_FOCI.map((w) => [w, WEEK_LABELS[w]] as const),
              ] as const
            ).map(([value, label]) => {
              const active = focus === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFocus(value)}
                  className={`min-h-10 rounded-xl px-3 text-sm font-semibold transition ${
                    active
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {filteredSelected && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  label="Top weight"
                  value={
                    filteredSelected.latestWeight != null
                      ? formatWeight(filteredSelected.latestWeight, unit)
                      : "—"
                  }
                  hint={
                    filteredSelected.startWeight != null
                      ? `from ${filteredSelected.startWeight}`
                      : undefined
                  }
                />
                <Stat
                  label="Weight Δ"
                  value={deltaLabel(
                    filteredSelected.weightDelta == null
                      ? null
                      : lbToDisplay(filteredSelected.weightDelta, unit),
                    unitLabel(unit)
                  )}
                  hint={`${filteredSelected.sessionCount} sessions`}
                  positive={
                    filteredSelected.weightDelta != null
                      ? filteredSelected.weightDelta > 0
                      : undefined
                  }
                />
                <Stat
                  label="Avg reps"
                  value={
                    filteredSelected.latestReps != null
                      ? `${filteredSelected.latestReps}`
                      : "—"
                  }
                  hint={
                    filteredSelected.startReps != null
                      ? `from ${filteredSelected.startReps}`
                      : undefined
                  }
                />
              </div>

              {chartPoints.length < 2 ? (
                <div className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
                  Log this exercise on at least two sessions
                  {focus !== "all" ? ` in ${WEEK_LABELS[focus]} weeks` : ""} to
                  see a trend line.
                  {chartPoints.length === 1 && (
                    <span className="mt-2 block text-[var(--ink)]">
                      Latest: {formatWeight(chartPoints[0].maxWeight, unit)} ×{" "}
                      {chartPoints[0].avgReps} reps avg (
                      {chartPoints[0].sets} sets)
                    </span>
                  )}
                </div>
              ) : (
                <ExerciseCharts chartPoints={chartPoints} unit={unit} />
              )}

              <section className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  All lifts in scope
                </h2>
                <ul className="space-y-2">
                  {exercises.map((ex) => {
                    const active = ex.key === selected?.key;
                    return (
                      <li key={ex.key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(ex.key)}
                          className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 py-3 text-left ring-1 transition active:scale-[0.99] ${
                            active
                              ? "bg-[var(--accent-soft)] ring-[var(--accent)]"
                              : "bg-[var(--card)] ring-[var(--stroke)]"
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-[var(--ink)]">
                              {ex.name}
                              {isStuckLift(ex.points) ? (
                                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-text)]">
                                  Stuck
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              Day {ex.dayNumber}
                              {ex.muscleGroup ? ` · ${ex.muscleGroup}` : ""} ·{" "}
                              {ex.sessionCount} sessions
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-[var(--ink)]">
                              {formatWeight(ex.latestWeight, unit)}
                            </p>
                            <p
                              className={`text-xs font-semibold ${
                                (ex.weightDelta ?? 0) > 0
                                  ? "text-[var(--ok-fg)]"
                                  : (ex.weightDelta ?? 0) < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--muted)]"
                              }`}
                            >
                              {deltaLabel(
                                ex.weightDelta == null
                                  ? null
                                  : lbToDisplay(ex.weightDelta, unit),
                                unitLabel(unit)
                              )}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  positive,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-[var(--card)] px-3 py-3 ring-1 ring-[var(--stroke)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight ${
          positive === true
            ? "text-[var(--ok-fg)]"
            : positive === false
              ? "text-[var(--danger)]"
              : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function MuscleAndAi({
  exercises,
  weekStart,
  aiAccuracy,
  unit,
}: {
  exercises: ExerciseProgress[];
  weekStart: string;
  aiAccuracy: AiAccuracy;
  unit: WeightUnit;
}) {
  const muscles = weeklyMuscleVolume(exercises, weekStart);
  const max = muscles[0]?.volume || 1;
  const matchPct =
    aiAccuracy.compared > 0
      ? Math.round((aiAccuracy.matched / aiAccuracy.compared) * 100)
      : null;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-[var(--card)] px-4 py-3 ring-1 ring-[var(--stroke)]">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Muscle volume · last 7 days
        </h2>
        {muscles.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No sets this week yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {muscles.map((m) => (
              <li key={m.muscle}>
                <div className="flex justify-between text-xs font-semibold text-[var(--ink)]">
                  <span className="capitalize">{m.muscle}</span>
                  <span>
                    {m.sets} sets · {formatWeight(m.volume, unit)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(8, (m.volume / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl bg-[var(--card)] px-4 py-3 ring-1 ring-[var(--stroke)]">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          AI suggestions
        </h2>
        {aiAccuracy.compared === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No suggested weights logged yet. Suggestions are stored next to each
            set so this fills in over time.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink)]">
            You kept the AI weight on {aiAccuracy.matched}/{aiAccuracy.compared}{" "}
            sets ({matchPct}%). Average override{" "}
            {aiAccuracy.avgAbsDelta == null
              ? "—"
              : formatWeight(aiAccuracy.avgAbsDelta, unit)}
            .
          </p>
        )}
      </section>
    </div>
  );
}
