"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  defaultTargetsForFocus,
  fociForMode,
  PERIODIZATION_OPTIONS,
  type FocusTarget,
  type PeriodizationMode,
} from "@/lib/periodization";
import type { LibraryExercise, RoutineDayInput, WeekFocus } from "@/lib/types";
import { ExerciseHowToButton } from "@/components/ExerciseHowTo";
import { ExercisePicker } from "@/components/ExercisePicker";
import { libraryToExercisePatch, safeExerciseImageUrl } from "@/lib/exercise-library";

type Mode = "choose" | "manual" | "ai" | "review";

function PeriodizationPicker({
  value,
  onChange,
}: {
  value: PeriodizationMode;
  onChange: (mode: PeriodizationMode) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Week focus
      </label>
      <div className="space-y-2">
        {PERIODIZATION_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange(opt.mode)}
            className={`flex min-h-12 w-full flex-col items-start rounded-xl px-3 py-2 text-left ${
              value === opt.mode
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "bg-[var(--card)] text-[var(--ink)] ring-1 ring-[var(--stroke)]"
            }`}
          >
            <span className="text-sm font-bold">{opt.label}</span>
            <span
              className={`text-xs ${
                value === opt.mode ? "text-[var(--accent-ink)]/80" : "text-[var(--muted)]"
              }`}
            >
              {opt.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewRoutineForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [minutesPerSession, setMinutesPerSession] = useState(30);
  const [periodizationMode, setPeriodizationMode] =
    useState<PeriodizationMode>("full");
  const [prompt, setPrompt] = useState("");
  const [days, setDays] = useState<RoutineDayInput[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function initManual() {
    const next: RoutineDayInput[] = Array.from(
      { length: daysPerWeek },
      (_, i) => ({
        day_number: i + 1,
        name: `Day ${i + 1}`,
        exercises: [],
      })
    );
    setDays(next);
    setActiveDay(0);
    setMode("manual");
  }

  async function generateAi() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/routines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          days_per_week: daysPerWeek,
          minutes_per_session: minutesPerSession,
          periodization_mode: periodizationMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setName(data.name ?? "AI Routine");
      if (data.periodization_mode) {
        setPeriodizationMode(data.periodization_mode);
      }
      setDays(data.days ?? []);
      setActiveDay(0);
      setMode("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function addLibExercise(lib: LibraryExercise) {
    setPickerOpen(false);
    // Build a target map with EACH focus's own defaults (not just one flat
    // set derived from a single focus) — otherwise every focus falls back
    // to whichever one was used here, and createRoutineFromDays ends up
    // writing identical exercise_targets rows for Light/Middle/Heavy.
    const foci = fociForMode(periodizationMode);
    const targets: Partial<Record<WeekFocus, FocusTarget>> = {};
    for (const focus of foci) {
      targets[focus] = defaultTargetsForFocus(focus);
    }
    // Flat target_sets/rep_low/rep_high are only used for this screen's
    // preview list — pick whichever focus the mode is pinned to, or Middle
    // as the representative value for the full Light→Middle→Heavy cycle.
    const primaryFocus: WeekFocus =
      periodizationMode === "light" ||
      periodizationMode === "heavy" ||
      periodizationMode === "middle"
        ? periodizationMode
        : "middle";
    const primary = targets[primaryFocus] ?? defaultTargetsForFocus(primaryFocus);
    setDays((prev) =>
      prev.map((d, i) =>
        i !== activeDay
          ? d
          : {
              ...d,
              exercises: [
                ...d.exercises,
                {
                  name: lib.name,
                  library_id: lib.id || null,
                  image_url: lib.imageUrl,
                  muscle_group: lib.primaryMuscles[0] ?? null,
                  target_sets: primary.target_sets,
                  rep_low: primary.rep_low,
                  rep_high: primary.rep_high,
                  targets,
                },
              ],
            }
      )
    );
  }

  async function save(source: "manual" | "ai") {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name your routine");
      return;
    }
    if (days.some((d) => d.exercises.length === 0)) {
      setError("Every day needs at least one exercise");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          source,
          periodization_mode: periodizationMode,
          make_active: true,
          days,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push("/today");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  if (mode === "choose") {
    return (
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Days per week
          </label>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDaysPerWeek(n)}
                className={`min-h-12 flex-1 rounded-xl text-base font-bold ${
                  daysPerWeek === n
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <PeriodizationPicker
          value={periodizationMode}
          onChange={setPeriodizationMode}
        />

        <button
          type="button"
          onClick={initManual}
          className="min-h-14 w-full rounded-xl bg-[var(--solid)] text-base font-bold text-[var(--on-solid)]"
        >
          Build myself
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)]"
        >
          Generate with AI
        </button>
      </div>
    );
  }

  if (mode === "ai") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          {daysPerWeek} days/week · ~{minutesPerSession} min ·{" "}
          {PERIODIZATION_OPTIONS.find((o) => o.mode === periodizationMode)?.short}
          . “Full body” = coverage across the week unless you say every day.
        </p>
        <PeriodizationPicker
          value={periodizationMode}
          onChange={setPeriodizationMode}
        />
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Minutes per session
          </label>
          <div className="flex gap-2">
            {[20, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutesPerSession(m)}
                className={`min-h-11 flex-1 rounded-xl text-sm font-bold ${
                  minutesPerSession === m
                    ? "bg-[var(--solid)] text-[var(--on-solid)]"
                    : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="e.g. Hit the whole body over the week, dumbbells + cables, strength focus…"
          className="w-full rounded-xl bg-[var(--input)] px-3 py-3 text-base ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void generateAi()}
          className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
        >
          {busy ? "Generating…" : "Generate draft"}
        </button>
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="w-full text-sm font-semibold text-[var(--muted)]"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Routine name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Summer PPL"
          className="min-h-12 w-full rounded-xl bg-[var(--input)] px-3 text-base font-semibold ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
      </div>

      <p className="text-xs text-[var(--muted)]">
        Week focus:{" "}
        {PERIODIZATION_OPTIONS.find((o) => o.mode === periodizationMode)?.label}
      </p>

      <div className="flex flex-wrap gap-2">
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveDay(i)}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold ${
              i === activeDay
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {days[activeDay] && (
        <section className="space-y-3 rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]">
          <input
            value={days[activeDay].name}
            onChange={(e) => {
              const v = e.target.value;
              setDays((prev) =>
                prev.map((d, i) =>
                  i === activeDay ? { ...d, name: v } : d
                )
              );
            }}
            className="min-h-11 w-full rounded-xl bg-[var(--canvas)] px-3 font-[family-name:var(--font-display)] text-xl font-bold ring-1 ring-[var(--stroke)]"
          />
          <ul className="space-y-2">
            {days[activeDay].exercises.map((ex, idx) => (
              <li
                key={`${ex.library_id ?? ex.name}-${idx}`}
                className="flex items-center gap-3 rounded-xl bg-[var(--canvas)]/70 px-3 py-2"
              >
                <Image
                  src={safeExerciseImageUrl(ex.image_url)}
                  alt=""
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{ex.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {ex.target_sets}×{ex.rep_low}–{ex.rep_high}
                    {periodizationMode === "full" ? " (middle shown)" : ""}
                  </p>
                  <ExerciseHowToButton
                    libraryId={ex.library_id}
                    name={ex.name}
                    onSwitch={(lib) => {
                      const patch = libraryToExercisePatch(lib);
                      setDays((prev) =>
                        prev.map((d, i) =>
                          i !== activeDay
                            ? d
                            : {
                                ...d,
                                exercises: d.exercises.map((item, j) =>
                                  j !== idx ? item : { ...item, ...patch }
                                ),
                              }
                        )
                      );
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDays((prev) =>
                      prev.map((d, i) =>
                        i !== activeDay
                          ? d
                          : {
                              ...d,
                              exercises: d.exercises.filter((_, j) => j !== idx),
                            }
                      )
                    )
                  }
                  className="text-sm font-semibold text-[var(--danger)]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]"
          >
            + Add exercise
          </button>
        </section>
      )}

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void save(mode === "review" ? "ai" : "manual")}
        className="min-h-14 w-full rounded-xl bg-[var(--solid)] text-base font-bold text-[var(--on-solid)] disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save & activate routine"}
      </button>
      <button
        type="button"
        onClick={() => setMode("choose")}
        className="w-full text-sm font-semibold text-[var(--muted)]"
      >
        Start over
      </button>

      {pickerOpen && (
        <ExercisePicker
          onClose={() => setPickerOpen(false)}
          onPick={addLibExercise}
        />
      )}
    </div>
  );
}
