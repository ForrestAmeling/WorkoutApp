"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ExerciseHowToButton } from "@/components/ExerciseHowTo";
import { ExercisePicker } from "@/components/ExercisePicker";
import { libraryToExercisePatch } from "@/lib/exercise-library";
import {
  defaultTargetsForFocus,
  fociForMode,
  modeLabel,
  parsePeriodizationMode,
} from "@/lib/periodization";
import type {
  EditorDay,
  EditorExercise,
} from "@/lib/routines";
import type { LibraryExercise, Routine, WeekFocus } from "@/lib/types";

export function RoutineEditor({
  routine: initialRoutine,
  days: initialDays,
}: {
  routine: Routine;
  days: EditorDay[];
}) {
  const router = useRouter();
  const [routine, setRoutine] = useState(initialRoutine);
  const [days, setDays] = useState(initialDays);
  const [activeDayId, setActiveDayId] = useState(initialDays[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(initialRoutine.name);

  const activeDay = useMemo(
    () => days.find((d) => d.id === activeDayId) ?? days[0],
    [days, activeDayId]
  );
  const periodizationMode =
    parsePeriodizationMode(routine.periodization_mode) ??
    (routine.uses_periodization ? "full" : "none");
  const editFoci = fociForMode(periodizationMode);

  async function saveName() {
    const name = nameDraft.trim();
    if (!name || name === routine.name) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("routines")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", routine.id);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setRoutine((r) => ({ ...r, name }));
    setMessage("Name saved");
    router.refresh();
  }

  async function addDay() {
    if (days.length >= 7) {
      setMessage("Max 7 days per week");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const day_number = days.length + 1;
    const { data, error } = await supabase
      .from("routine_days")
      .insert({
        routine_id: routine.id,
        day_number,
        name: `Day ${day_number}`,
        sort_order: day_number,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setDays((prev) => [...prev, { ...data, exercises: [] }]);
    setActiveDayId(data.id);
    router.refresh();
  }

  async function renameDay(dayId: string, name: string) {
    const supabase = createClient();
    await supabase.from("routine_days").update({ name }).eq("id", dayId);
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, name } : d))
    );
  }

  async function removeDay(dayId: string) {
    if (days.length <= 1) {
      setMessage("Keep at least one day");
      return;
    }
    if (!confirm("Remove this day and its exercises?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("routine_days")
      .delete()
      .eq("id", dayId);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const next = days.filter((d) => d.id !== dayId);
    // Renumber locally + in DB
    setDays(next);
    setActiveDayId(next[0]?.id ?? "");
    for (let i = 0; i < next.length; i++) {
      await supabase
        .from("routine_days")
        .update({ day_number: i + 1, sort_order: i + 1, name: next[i].name })
        .eq("id", next[i].id);
      await supabase
        .from("exercises")
        .update({ day_number: i + 1 })
        .eq("routine_day_id", next[i].id);
    }
    setDays((prev) =>
      prev.map((d, i) => ({ ...d, day_number: i + 1, sort_order: i + 1 }))
    );
    router.refresh();
  }

  async function addExercise(lib: LibraryExercise) {
    if (!activeDay) return;
    setPickerOpen(false);
    setBusy(true);
    const supabase = createClient();
    const sort = activeDay.exercises.length + 1;
    const { data: ex, error } = await supabase
      .from("exercises")
      .insert({
        name: lib.name,
        muscle_group: lib.primaryMuscles[0] ?? null,
        day_number: activeDay.day_number,
        is_accessory: false,
        sort_order: sort,
        routine_id: routine.id,
        routine_day_id: activeDay.id,
        library_id: lib.id,
        image_url: lib.imageUrl,
        is_template: false,
      })
      .select("*")
      .single();
    if (error) {
      setBusy(false);
      setMessage(error.message);
      return;
    }

    const targetRows = editFoci.map((week_focus) => {
      const d = defaultTargetsForFocus(week_focus);
      return {
        exercise_id: ex.id,
        week_focus,
        target_sets: d.target_sets,
        rep_low: d.rep_low,
        rep_high: d.rep_high,
      };
    });
    const { data: targets, error: tError } = await supabase
      .from("exercise_targets")
      .insert(targetRows)
      .select("*");
    setBusy(false);
    if (tError) {
      setMessage(tError.message);
      return;
    }

    const editorEx: EditorExercise = {
      ...(ex as EditorExercise),
      targets: targets ?? [],
    };
    setDays((prev) =>
      prev.map((d) =>
        d.id === activeDay.id
          ? { ...d, exercises: [...d.exercises, editorEx] }
          : d
      )
    );
    router.refresh();
  }

  async function switchExercise(exerciseId: string, lib: LibraryExercise) {
    const patch = libraryToExercisePatch(lib);
    const supabase = createClient();
    const { error } = await supabase
      .from("exercises")
      .update(patch)
      .eq("id", exerciseId);
    if (error) throw new Error(error.message);
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) =>
          e.id === exerciseId ? { ...e, ...patch } : e
        ),
      }))
    );
    router.refresh();
  }

  async function removeExercise(exerciseId: string) {
    if (!confirm("Remove this exercise?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", exerciseId);
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        exercises: d.exercises.filter((e) => e.id !== exerciseId),
      }))
    );
    router.refresh();
  }

  async function moveExercise(exerciseId: string, dir: -1 | 1) {
    if (!activeDay) return;
    const list = [...activeDay.exercises];
    const idx = list.findIndex((e) => e.id === exerciseId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= list.length) return;
    const a = list[idx];
    const b = list[next];
    list[idx] = b;
    list[next] = a;
    const supabase = createClient();
    await supabase
      .from("exercises")
      .update({ sort_order: next + 1 })
      .eq("id", a.id);
    await supabase
      .from("exercises")
      .update({ sort_order: idx + 1 })
      .eq("id", b.id);
    setDays((prev) =>
      prev.map((d) =>
        d.id === activeDay.id
          ? {
              ...d,
              exercises: list.map((e, i) => ({ ...e, sort_order: i + 1 })),
            }
          : d
      )
    );
  }

  async function updateTarget(
    exerciseId: string,
    weekFocus: WeekFocus,
    patch: Partial<{ target_sets: number; rep_low: number; rep_high: number }>
  ) {
    const supabase = createClient();
    const day = days.find((d) => d.exercises.some((e) => e.id === exerciseId));
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    const current = ex?.targets.find((t) => t.week_focus === weekFocus);
    if (!current) return;

    const next = { ...current, ...patch };
    const { error } = await supabase
      .from("exercise_targets")
      .update({
        target_sets: next.target_sets,
        rep_low: next.rep_low,
        rep_high: next.rep_high,
      })
      .eq("id", current.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) =>
          e.id !== exerciseId
            ? e
            : {
                ...e,
                targets: e.targets.map((t) =>
                  t.week_focus === weekFocus ? { ...t, ...patch } : t
                ),
              }
        ),
      }))
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Routine name
        </label>
        <div className="flex gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="min-h-12 flex-1 rounded-xl bg-[var(--input)] px-3 text-base font-semibold ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveName()}
            className="min-h-12 rounded-xl bg-[var(--solid)] px-4 text-sm font-bold text-[var(--on-solid)]"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {modeLabel(periodizationMode)}
          {routine.is_active ? " · Active" : ""}
          {" · "}Manual edits save as you go
        </p>
      </div>

      <section className="space-y-3 rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink)]">
          Edit with AI
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Equipment/exercise swaps keep your Light (20–25) / Middle (8–12) /
          Heavy (4–6) targets. Mention sets or reps in the prompt only if you
          want those changed. Updates this routine in place — Copy first if you
          want a separate version.
        </p>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Make Day 2 more pull-focused and drop to 3 exercises…"
          className="w-full rounded-xl bg-[var(--canvas)] px-3 py-3 text-base ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          disabled={aiBusy || aiPrompt.trim().length < 4}
          onClick={async () => {
            setAiBusy(true);
            setMessage(null);
            try {
              const res = await fetch(`/api/routines/${routine.id}/ai-edit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: aiPrompt.trim(),
                  apply: true,
                  periodization_mode: periodizationMode,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "AI edit failed");
              setRoutine(data.routine);
              setNameDraft(data.routine.name);
              setDays(data.days);
              setActiveDayId(data.days[0]?.id ?? "");
              setAiPrompt("");
              setMessage("AI changes saved to this routine.");
              router.refresh();
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "AI edit failed");
            } finally {
              setAiBusy(false);
            }
          }}
          className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
        >
          {aiBusy ? "Updating with AI…" : "Apply AI changes"}
        </button>
      </section>

      <div className="flex flex-wrap gap-2">
        {days.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setActiveDayId(d.id)}
            className={`min-h-11 rounded-xl px-3 text-sm font-bold ${
              d.id === activeDay?.id
                ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
            }`}
          >
            {d.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void addDay()}
          disabled={busy || days.length >= 7}
          className="min-h-11 rounded-xl bg-[var(--input)] px-3 text-sm font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] disabled:opacity-50"
        >
          + Day
        </button>
      </div>

      {activeDay && (
        <section className="space-y-3 rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]">
          <div className="flex items-center gap-2">
            <input
              value={activeDay.name}
              onChange={(e) => {
                const name = e.target.value;
                setDays((prev) =>
                  prev.map((d) =>
                    d.id === activeDay.id ? { ...d, name } : d
                  )
                );
              }}
              onBlur={(e) => void renameDay(activeDay.id, e.target.value.trim() || activeDay.name)}
              className="min-h-11 flex-1 rounded-xl bg-[var(--canvas)] px-3 font-[family-name:var(--font-display)] text-xl font-bold ring-1 ring-[var(--stroke)]"
            />
            <button
              type="button"
              onClick={() => void removeDay(activeDay.id)}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--danger)]"
            >
              Remove day
            </button>
          </div>

          <ul className="space-y-3">
            {activeDay.exercises.map((ex) => (
                <li
                  key={ex.id}
                  className="rounded-xl bg-[var(--canvas)]/70 p-3 ring-1 ring-[var(--stroke)]"
                >
                  <div className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ex.image_url ?? "/icon-192.png"}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover bg-[var(--input)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--ink)]">{ex.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {ex.muscle_group ?? "custom"}
                      </p>
                      <div className="mt-1">
                        <ExerciseHowToButton
                          libraryId={ex.library_id}
                          name={ex.name}
                          onSwitch={(lib) => switchExercise(ex.id, lib)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => void moveExercise(ex.id, -1)}
                        className="min-h-9 rounded-lg px-2 text-xs font-bold text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveExercise(ex.id, 1)}
                        className="min-h-9 rounded-lg px-2 text-xs font-bold text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeExercise(ex.id)}
                        className="text-sm font-semibold text-[var(--danger)]"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {editFoci.map((focus) => {
                      const t = ex.targets.find((x) => x.week_focus === focus);
                      if (!t) return null;
                      return (
                        <div
                          key={focus}
                          className="grid grid-cols-[4.5rem_1fr_1fr_1fr] items-center gap-2 text-xs"
                        >
                          <span className="font-semibold capitalize text-[var(--muted)]">
                            {periodizationMode === "none" ? "Target" : focus}
                          </span>
                          <label className="flex flex-col gap-0.5">
                            Sets
                            <input
                              type="number"
                              min={1}
                              max={8}
                              value={t.target_sets}
                              onChange={(e) =>
                                void updateTarget(ex.id, focus, {
                                  target_sets: Number(e.target.value),
                                })
                              }
                              className="min-h-9 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            Rep low
                            <input
                              type="number"
                              min={1}
                              value={t.rep_low}
                              onChange={(e) =>
                                void updateTarget(ex.id, focus, {
                                  rep_low: Number(e.target.value),
                                })
                              }
                              className="min-h-9 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
                            />
                          </label>
                          <label className="flex flex-col gap-0.5">
                            Rep high
                            <input
                              type="number"
                              min={1}
                              value={t.rep_high}
                              onChange={(e) =>
                                void updateTarget(ex.id, focus, {
                                  rep_high: Number(e.target.value),
                                })
                              }
                              className="min-h-9 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
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

      {message && (
        <p className="text-sm text-[var(--muted)]">{message}</p>
      )}

      {pickerOpen && (
        <ExercisePicker
          onClose={() => setPickerOpen(false)}
          onPick={(ex) => void addExercise(ex)}
        />
      )}
    </div>
  );
}
