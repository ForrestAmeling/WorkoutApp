"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { ExerciseHowToButton } from "@/components/ExerciseHowTo";
import { ExercisePicker } from "@/components/ExercisePicker";
import { libraryToExercisePatch, safeExerciseImageUrl } from "@/lib/exercise-library";
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
  const [muscleOptions, setMuscleOptions] = useState<string[]>([]);

  // Same free-exercise-db muscle vocabulary ExercisePicker's filter dropdown
  // already uses, so custom exercises can be tagged with the same
  // categories a library-linked exercise would carry — instead of the only
  // way to set a custom exercise's muscle group being to fully switch it to
  // a (possibly differently-named) library match.
  useEffect(() => {
    void fetch("/api/exercise-library?meta=1")
      .then((r) => r.json())
      .then((d) => setMuscleOptions(d.muscles ?? []))
      .catch(() => undefined);
  }, []);

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
    // Track failures instead of assuming every renumber update landed — a
    // partial failure here would otherwise silently leave the DB's
    // day_number/sort_order out of sync with what's shown locally.
    //
    // This stays a sequential, ascending-order loop deliberately: it's
    // compacting a range of values down by one (e.g. 2,3,4 -> 1,2,3), and
    // each step's new value is the *previous* row's old value. Running
    // these concurrently could transiently assign two rows the same
    // day_number/sort_order before the other update commits — sequential
    // ascending order guarantees each step frees the value the next one
    // needs before it's requested. (Unlike a plain pairwise swap — see
    // moveExercise — this isn't safe to parallelize.)
    let renumberFailed = false;
    for (let i = 0; i < next.length; i++) {
      const { error: dayError } = await supabase
        .from("routine_days")
        .update({ day_number: i + 1, sort_order: i + 1, name: next[i].name })
        .eq("id", next[i].id);
      const { error: exError } = await supabase
        .from("exercises")
        .update({ day_number: i + 1 })
        .eq("routine_day_id", next[i].id);
      if (dayError || exError) renumberFailed = true;
    }
    setDays((prev) =>
      prev.map((d, i) => ({ ...d, day_number: i + 1, sort_order: i + 1 }))
    );
    if (renumberFailed) {
      setMessage(
        "Day removed, but renumbering the rest failed partway — reload to make sure day order is right."
      );
    }
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
        library_id: lib.id || null,
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

  // Only meant for custom (unlinked) exercises — a library-linked exercise's
  // muscle_group is kept in sync with free-exercise-db by switchExercise
  // above, so Progress's muscle-volume breakdown (which reads muscle_group
  // straight off the exercises row) reflects it automatically.
  async function updateMuscleGroup(exerciseId: string, muscleGroup: string) {
    const value = muscleGroup || null;
    const supabase = createClient();
    const { error } = await supabase
      .from("exercises")
      .update({ muscle_group: value })
      .eq("id", exerciseId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setDays((prev) =>
      prev.map((d) => ({
        ...d,
        exercises: d.exercises.map((e) =>
          e.id === exerciseId ? { ...e, muscle_group: value } : e
        ),
      }))
    );
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
    const reordered = list.map((e, i) => ({ ...e, sort_order: i + 1 }));
    // Apply the reorder to state immediately — this is what actually makes
    // it optimistic. Previously setDays ran after both Supabase calls
    // resolved, so nothing moved on screen until two round trips finished,
    // despite a comment here claiming otherwise.
    setDays((prev) =>
      prev.map((d) =>
        d.id === activeDay.id ? { ...d, exercises: reordered } : d
      )
    );
    const supabase = createClient();
    const [{ error: aError }, { error: bError }] = await Promise.all([
      supabase
        .from("exercises")
        .update({ sort_order: next + 1 })
        .eq("id", a.id),
      supabase
        .from("exercises")
        .update({ sort_order: idx + 1 })
        .eq("id", b.id),
    ]);
    if (aError || bError) {
      setMessage(
        "Reorder failed to fully save — reload to make sure exercise order is right."
      );
    }
  }

  // Keyed by exercise_targets row id. targetTimers holds the pending
  // debounce timer; pendingTargetWrites holds the latest value to write
  // when that timer fires — a ref, not React state, so the setTimeout
  // callback always sees the most recent edit instead of whatever was
  // typed when the timer was first scheduled.
  const targetTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingTargetWrites = useRef(
    new Map<string, { target_sets: number; rep_low: number; rep_high: number }>()
  );

  // If an edit is still debouncing when the user leaves — navigating
  // in-app (unmount) or closing/refreshing the tab (pagehide) — don't just
  // cancel it, that would silently drop an edit already echoed on screen
  // as saved. Flush every still-pending write immediately instead of
  // waiting out its remaining delay. (pagehide fires more reliably than
  // beforeunload for this; the fetch it kicks off isn't guaranteed to
  // finish on a hard close, but it's strictly better than never trying.)
  useEffect(() => {
    function flushPendingTargetWrites() {
      for (const [key, timer] of targetTimers.current) {
        clearTimeout(timer);
        const pending = pendingTargetWrites.current.get(key);
        if (pending) {
          void createClient().from("exercise_targets").update(pending).eq("id", key);
        }
      }
      targetTimers.current.clear();
      pendingTargetWrites.current.clear();
    }
    window.addEventListener("pagehide", flushPendingTargetWrites);
    return () => {
      window.removeEventListener("pagehide", flushPendingTargetWrites);
      flushPendingTargetWrites();
    };
  }, []);

  function updateTarget(
    exerciseId: string,
    weekFocus: WeekFocus,
    patch: Partial<{ target_sets: number; rep_low: number; rep_high: number }>
  ) {
    const day = days.find((d) => d.exercises.some((e) => e.id === exerciseId));
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    const current = ex?.targets.find((t) => t.week_focus === weekFocus);
    if (!current) return;
    const nextValue = { ...current, ...patch };

    // Echo the typed value immediately so the field never waits on a
    // network round trip to show what was just typed.
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

    // Debounce the actual write: a burst of edits (typing multiple
    // digits, clicking the spinner repeatedly) should produce one
    // Supabase call, not one per keystroke — and it should always send
    // the latest values typed so far, not just this one keystroke's.
    const key = current.id;
    pendingTargetWrites.current.set(key, {
      target_sets: nextValue.target_sets,
      rep_low: nextValue.rep_low,
      rep_high: nextValue.rep_high,
    });
    const existingTimer = targetTimers.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    targetTimers.current.set(
      key,
      setTimeout(() => {
        targetTimers.current.delete(key);
        const pending = pendingTargetWrites.current.get(key);
        pendingTargetWrites.current.delete(key);
        if (!pending) return;
        const supabase = createClient();
        void supabase
          .from("exercise_targets")
          .update(pending)
          .eq("id", key)
          .then(({ error }) => {
            if (error) setMessage(error.message);
          });
      }, 500)
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
                    <Image
                      src={safeExerciseImageUrl(ex.image_url)}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg object-cover bg-[var(--input)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--ink)]">{ex.name}</p>
                      {ex.library_id ? (
                        <p className="text-xs text-[var(--muted)]">
                          {ex.muscle_group ?? "—"}
                        </p>
                      ) : (
                        <select
                          value={ex.muscle_group ?? ""}
                          onChange={(e) =>
                            void updateMuscleGroup(ex.id, e.target.value)
                          }
                          className="mt-0.5 min-h-7 max-w-[9rem] rounded-lg bg-[var(--input)] px-1.5 text-xs text-[var(--muted)] ring-1 ring-[var(--stroke)]"
                        >
                          <option value="">Pick a muscle…</option>
                          {ex.muscle_group &&
                            !muscleOptions.includes(ex.muscle_group) && (
                              <option value={ex.muscle_group}>
                                {ex.muscle_group}
                              </option>
                            )}
                          {muscleOptions.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
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
                          className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-xs"
                        >
                          <span className="truncate font-semibold capitalize text-[var(--muted)]">
                            {periodizationMode === "none" ? "Target" : focus}
                          </span>
                          <label className="flex min-w-0 flex-col gap-0.5">
                            Sets
                            <input
                              type="number"
                              min={1}
                              max={8}
                              value={t.target_sets}
                              onChange={(e) =>
                                updateTarget(ex.id, focus, {
                                  target_sets: Number(e.target.value),
                                })
                              }
                              className="min-h-9 w-full min-w-0 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
                            />
                          </label>
                          <label className="flex min-w-0 flex-col gap-0.5">
                            Rep low
                            <input
                              type="number"
                              min={1}
                              value={t.rep_low}
                              onChange={(e) =>
                                updateTarget(ex.id, focus, {
                                  rep_low: Number(e.target.value),
                                })
                              }
                              className="min-h-9 w-full min-w-0 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
                            />
                          </label>
                          <label className="flex min-w-0 flex-col gap-0.5">
                            Rep high
                            <input
                              type="number"
                              min={1}
                              value={t.rep_high}
                              onChange={(e) =>
                                updateTarget(ex.id, focus, {
                                  rep_high: Number(e.target.value),
                                })
                              }
                              className="min-h-9 w-full min-w-0 rounded-lg bg-[var(--input)] px-2 ring-1 ring-[var(--stroke)]"
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
