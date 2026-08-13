"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WEEK_FOCI, WEEK_LABELS } from "@/lib/program";
import {
  filterPointsByFocus,
  type ExerciseProgress,
} from "@/lib/progress";
import type { Routine, WeekFocus } from "@/lib/types";

type FocusFilter = WeekFocus | "all";

type Props = {
  routines: Routine[];
  selectedRoutineId: string | null;
  exercises: ExerciseProgress[];
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

export function ProgressDashboard({
  routines,
  selectedRoutineId,
  exercises,
}: Props) {
  const router = useRouter();
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
          className="min-h-12 w-full rounded-xl bg-white/80 px-3 text-sm font-semibold text-[var(--ink)] ring-1 ring-black/5"
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

      {exercises.length === 0 ? (
        <div className="rounded-2xl bg-white/70 px-4 py-8 text-center text-sm text-[var(--muted)] ring-1 ring-black/5">
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
              className="min-h-12 w-full rounded-xl bg-white/80 px-3 text-sm font-semibold text-[var(--ink)] ring-1 ring-black/5"
              value={selected?.key ?? ""}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {exercises.map((ex) => (
                <option key={ex.key} value={ex.key}>
                  Day {ex.dayNumber} · {ex.name}
                  {ex.weightDelta != null && ex.weightDelta !== 0
                    ? ` (${deltaLabel(ex.weightDelta, "lb")})`
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
                      : "bg-white/70 text-[var(--muted)] ring-1 ring-black/5"
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
                      ? `${filteredSelected.latestWeight} lb`
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
                  value={deltaLabel(filteredSelected.weightDelta, "lb")}
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
                <div className="rounded-2xl bg-white/70 px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-black/5">
                  Log this exercise on at least two sessions
                  {focus !== "all" ? ` in ${WEEK_LABELS[focus]} weeks` : ""} to
                  see a trend line.
                  {chartPoints.length === 1 && (
                    <span className="mt-2 block text-[var(--ink)]">
                      Latest: {chartPoints[0].maxWeight} lb ×{" "}
                      {chartPoints[0].avgReps} reps avg (
                      {chartPoints[0].sets} sets)
                    </span>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <ChartCard title="Weight (top set)">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart
                        data={chartPoints}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke="#e2e8e4" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#5b6b64", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#d5ddd8" }}
                        />
                        <YAxis
                          tick={{ fill: "#5b6b64", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={36}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.06)",
                            fontSize: 12,
                          }}
                          formatter={(value) => [
                            `${value as number} lb`,
                            "Top weight",
                          ]}
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as
                              | (typeof chartPoints)[0]
                              | undefined;
                            if (!row) return "";
                            return `${row.date} · ${WEEK_LABELS[row.weekFocus]}`;
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="maxWeight"
                          stroke="#1a2a12"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: "#d6ff3f", stroke: "#1a2a12" }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Reps (session average)">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart
                        data={chartPoints}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid stroke="#e2e8e4" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#5b6b64", fontSize: 11 }}
                          tickLine={false}
                          axisLine={{ stroke: "#d5ddd8" }}
                        />
                        <YAxis
                          tick={{ fill: "#5b6b64", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={36}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid rgba(0,0,0,0.06)",
                            fontSize: 12,
                          }}
                          formatter={(value) => [
                            `${value as number}`,
                            "Avg reps",
                          ]}
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as
                              | (typeof chartPoints)[0]
                              | undefined;
                            if (!row) return "";
                            return `${row.date} · ${WEEK_LABELS[row.weekFocus]} · ${row.sets} sets`;
                          }}
                        />
                        <Legend
                          verticalAlign="top"
                          height={28}
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avgReps"
                          name="Avg reps"
                          stroke="#3d6b52"
                          strokeWidth={2.5}
                          dot={{ r: 3.5, fill: "#eaf8a8", stroke: "#3d6b52" }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="maxReps"
                          name="Best set"
                          stroke="#8aa396"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
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
                              : "bg-white/80 ring-black/5"
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-[var(--ink)]">
                              {ex.name}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              Day {ex.dayNumber}
                              {ex.muscleGroup ? ` · ${ex.muscleGroup}` : ""} ·{" "}
                              {ex.sessionCount} sessions
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-[var(--ink)]">
                              {ex.latestWeight != null
                                ? `${ex.latestWeight} lb`
                                : "—"}
                            </p>
                            <p
                              className={`text-xs font-semibold ${
                                (ex.weightDelta ?? 0) > 0
                                  ? "text-emerald-700"
                                  : (ex.weightDelta ?? 0) < 0
                                    ? "text-rose-700"
                                    : "text-[var(--muted)]"
                              }`}
                            >
                              {deltaLabel(ex.weightDelta, "lb")}
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
    <div className="rounded-2xl bg-white/80 px-3 py-3 ring-1 ring-black/5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight ${
          positive === true
            ? "text-emerald-700"
            : positive === false
              ? "text-rose-700"
              : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/85 px-3 py-4 ring-1 ring-black/5 animate-rise">
      <h3 className="mb-2 px-1 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--ink)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
