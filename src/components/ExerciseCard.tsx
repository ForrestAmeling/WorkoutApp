"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTarget } from "@/lib/program";
import {
  enqueueSet,
  isNetworkError,
  queuedToSetLog,
} from "@/lib/offline-queue";
import { useSettings } from "@/components/SettingsProvider";
import {
  displayToLb,
  formatWeight,
  isPartialDecimal,
  lbToDisplay,
  unitLabel,
  weightStep,
} from "@/lib/units";
import { ExerciseHowToButton } from "@/components/ExerciseHowTo";
import { libraryToExercisePatch } from "@/lib/exercise-library";
import { SET_SYNCED_EVENT, type SetSyncedDetail } from "@/lib/set-sync-events";
import type { ExerciseWithTarget, LibraryExercise, SetLog, WeekFocus } from "@/lib/types";

export function ExerciseCard({
  exercise,
  sessionId: initialSessionId,
  weekFocus,
  dayNumber,
  routineId,
  cycleId,
  performedOn,
  open,
  onOpenChange,
  onSetsChange,
  onLogged,
  onReplaced,
}: {
  exercise: ExerciseWithTarget;
  sessionId: string | null;
  weekFocus: WeekFocus;
  dayNumber: number;
  routineId: string;
  cycleId: string | null;
  performedOn: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSetsChange: (exerciseId: string, sets: SetLog[]) => void;
  onLogged: () => void;
  onReplaced?: (
    exerciseId: string,
    patch: ReturnType<typeof libraryToExercisePatch>
  ) => void;
}) {
  const { settings } = useSettings();
  const unit = settings.unit;
  const [sets, setSets] = useState<SetLog[]>(exercise.sets);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [weight, setWeight] = useState<string>("");
  const [bodyweight, setBodyweight] = useState(false);
  const [reps, setReps] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [aiSuggested, setAiSuggested] = useState<number | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWeight, setEditWeight] = useState<string>("");
  const [editBodyweight, setEditBodyweight] = useState(false);
  const [editReps, setEditReps] = useState<number | "">("");
  const [editNotes, setEditNotes] = useState("");
  const [loggingExtra, setLoggingExtra] = useState(false);

  const targetDone = sets.length >= exercise.target.target_sets;
  const showLogForm = open && (!targetDone || loggingExtra);
  const nextSet = sets.length + 1;
  const targetLabel = formatTarget(
    exercise.target.target_sets,
    exercise.target.rep_low,
    exercise.target.rep_high
  );

  useEffect(() => {
    setSets(exercise.sets);
  }, [exercise.sets]);

  useEffect(() => {
    setSessionId(initialSessionId);
  }, [initialSessionId]);

  useEffect(() => {
    if (!open || weight !== "" || bodyweight || sets.length > 0) return;
    void fetchSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reconcile a set that was saved to the offline queue once OfflineSync
  // confirms it actually made it to Supabase — swaps the temporary
  // "local-…" id for the real row so editing/deleting it stops being
  // blocked (previously only cleared on a full page reload).
  useEffect(() => {
    function onSynced(e: Event) {
      const { localId, row } = (e as CustomEvent<SetSyncedDetail>).detail;
      setSets((prev) => {
        if (!prev.some((s) => s.id === localId)) return prev;
        const next = prev.map((s) => (s.id === localId ? row : s));
        onSetsChange(exercise.id, next);
        return next;
      });
    }
    window.addEventListener(SET_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SET_SYNCED_EVENT, onSynced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  function commitSets(next: SetLog[]) {
    setSets(next);
    onSetsChange(exercise.id, next);
  }

  async function replaceExercise(lib: LibraryExercise) {
    const patch = libraryToExercisePatch(lib);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("exercises")
      .update(patch)
      .eq("id", exercise.id);
    if (updateError) throw new Error(updateError.message);
    onReplaced?.(exercise.id, patch);
  }

  async function fetchSuggestion() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_id: exercise.id,
          library_id: exercise.library_id,
          week_focus: weekFocus,
          rep_low: exercise.target.rep_low,
          rep_high: exercise.target.rep_high,
          session_sets: sets.map((s) => ({
            weight: s.weight,
            reps: s.reps,
            set_number: s.set_number,
          })),
        }),
      });
      const data = await res.json();
      if (data.suggested_weight != null) {
        const lb = Number(data.suggested_weight);
        setWeight(String(lbToDisplay(lb, unit)));
        setAiSuggested(lb);
        setRationale(data.rationale ?? null);
      } else {
        setAiSuggested(null);
        setRationale(data.rationale ?? null);
      }
    } catch {
      setError("Could not fetch suggestion");
    } finally {
      setSuggesting(false);
    }
  }

  async function resolveSessionId(supabase: ReturnType<typeof createClient>) {
    if (sessionId && sessionId !== "pending") return sessionId;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const { data: existing } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("routine_id", routineId)
      .eq("performed_on", performedOn)
      .eq("week_focus", weekFocus)
      .eq("day_number", dayNumber)
      .maybeSingle();

    if (existing?.id) {
      setSessionId(existing.id);
      return existing.id as string;
    }

    const { data: created, error: createError } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        cycle_id: cycleId,
        routine_id: routineId,
        week_focus: weekFocus,
        day_number: dayNumber,
        performed_on: performedOn,
      })
      .select("id")
      .single();

    if (createError) {
      const { data: raced } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("routine_id", routineId)
        .eq("performed_on", performedOn)
        .eq("week_focus", weekFocus)
        .eq("day_number", dayNumber)
        .maybeSingle();
      if (raced?.id) {
        setSessionId(raced.id);
        return raced.id as string;
      }
      throw createError;
    }
    setSessionId(created.id);
    return created.id as string;
  }

  async function logSet() {
    if (busy) return;
    if ((!bodyweight && weight === "") || reps === "") {
      setError("Enter weight and reps");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const lb = bodyweight ? null : displayToLb(Number(weight), unit);
    const payload = {
      exercise_id: exercise.id,
      set_number: nextSet,
      weight: lb,
      reps: Number(reps),
      ai_suggested_weight: aiSuggested,
      notes: notes.trim() || null,
    };

    try {
      const activeSessionId = await resolveSessionId(supabase);
      const { data, error: insertError } = await supabase
        .from("set_logs")
        .insert({
          session_id: activeSessionId,
          ...payload,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;
      commitSets([...sets, data as SetLog]);
      afterSave();
    } catch (e) {
      if (isNetworkError(e)) {
        const queued = enqueueSet({
          session: {
            routineId,
            weekFocus,
            dayNumber,
            cycleId,
            performedOn,
          },
          log: payload,
        });
        commitSets([...sets, queuedToSetLog(queued, exercise.id)]);
        afterSave();
        setError("Saved on this phone — will sync when you are online.");
      } else {
        setError(e instanceof Error ? e.message : "Could not save set");
      }
    } finally {
      setBusy(false);
    }
  }

  function afterSave() {
    setReps("");
    setNotes("");
    setShowNotes(false);
    setAiSuggested(null);
    setRationale(null);
    setLoggingExtra(false);
    onLogged();
  }

  async function saveEdit(set: SetLog) {
    if ((!editBodyweight && editWeight === "") || editReps === "") {
      setError("Enter weight and reps");
      return;
    }
    if (set.id.startsWith("local-")) {
      setError("Wait until this set syncs to edit it.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const lb = editBodyweight ? null : displayToLb(Number(editWeight), unit);
    const { data, error: updateError } = await supabase
      .from("set_logs")
      .update({
        weight: lb,
        reps: Number(editReps),
        notes: editNotes.trim() || null,
      })
      .eq("id", set.id)
      .select("*")
      .single();
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    commitSets(sets.map((s) => (s.id === set.id ? (data as SetLog) : s)));
    setEditingId(null);
  }

  async function deleteSet(set: SetLog) {
    if (!confirm("Delete this set?")) return;
    if (set.id.startsWith("local-")) {
      setError("Wait until this set syncs to delete it.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: delError } = await supabase
      .from("set_logs")
      .delete()
      .eq("id", set.id);
    setBusy(false);
    if (delError) {
      setError(delError.message);
      return;
    }
    const remaining = sets
      .filter((s) => s.id !== set.id)
      .map((s, i) => ({ ...s, set_number: i + 1 }));
    // Renumber the sets that shifted down. Track failures instead of
    // assuming success — on the same flaky connections that make saving a
    // set fail (see isNetworkError), one of these updates can fail while
    // the rest succeed, leaving the DB's set_number out of sync with what
    // we're about to show. Surface that instead of silently proceeding.
    let renumberFailed = false;
    for (const s of remaining) {
      if (s.id.startsWith("local-")) continue;
      const { error: renumberError } = await supabase
        .from("set_logs")
        .update({ set_number: s.set_number })
        .eq("id", s.id);
      if (renumberError) renumberFailed = true;
    }
    commitSets(remaining);
    setEditingId(null);
    if (renumberFailed) {
      setError(
        "Set deleted, but renumbering the rest failed — reload to make sure the order is right."
      );
    }
  }

  function bumpWeight(delta: number) {
    setWeight((w) => {
      const base = w === "" ? 0 : Number(w);
      return String(Math.max(0, Math.round((base + delta) * 4) / 4));
    });
  }

  function bumpReps(delta: number) {
    setReps((r) => {
      const base = r === "" ? 0 : Number(r);
      return Math.max(0, base + delta);
    });
  }

  function startEdit(s: SetLog) {
    setEditingId(s.id);
    setEditBodyweight(s.weight == null);
    setEditWeight(
      s.weight == null ? "" : String(lbToDisplay(Number(s.weight), unit))
    );
    setEditReps(s.reps ?? "");
    setEditNotes(s.notes ?? "");
    onOpenChange(true);
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--card)] ring-1 ring-[var(--stroke)]">
      <div className="flex items-start justify-between gap-3 px-4 py-4">
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={exercise.image_url ?? "/icon-192.png"}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl object-cover bg-[var(--canvas)]"
          />
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-lg leading-tight text-[var(--ink)]">
              {exercise.name}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {targetLabel}
              {exercise.muscle_group ? ` · ${exercise.muscle_group}` : ""}
              {!open && !targetDone ? " · Tap to log" : ""}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              targetDone
                ? "bg-[var(--ok-bg)] text-[var(--ok-fg)]"
                : "bg-[var(--chip)] text-[var(--chip-ink)]"
            }`}
          >
            {sets.length}/{exercise.target.target_sets}
          </span>
          <ExerciseHowToButton
            libraryId={exercise.library_id}
            name={exercise.name}
            onSwitch={replaceExercise}
          />
        </div>
      </div>

      {sets.length > 0 && (
        <ul className="space-y-1 border-t border-[var(--stroke)] px-4 py-3">
          {sets.map((s) => (
            <li key={s.id} className="text-sm text-[var(--ink)]">
              {editingId === s.id ? (
                <div className="space-y-2 rounded-xl bg-[var(--canvas)]/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Edit set {s.set_number}
                      {s.id.startsWith("local-") ? " · pending sync" : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditBodyweight((b) => !b)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        editBodyweight
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "bg-[var(--chip)] text-[var(--chip-ink)]"
                      }`}
                    >
                      Bodyweight
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {!editBodyweight && (
                      <label className="text-xs text-[var(--muted)]">
                        {unitLabel(unit)}
                        <input
                          inputMode="decimal"
                          value={editWeight}
                          onChange={(e) => {
                            if (isPartialDecimal(e.target.value)) {
                              setEditWeight(e.target.value);
                            }
                          }}
                          className="mt-1 min-h-11 w-full rounded-lg bg-[var(--input)] px-2 text-base font-bold ring-1 ring-[var(--stroke)]"
                        />
                      </label>
                    )}
                    <label
                      className={`text-xs text-[var(--muted)] ${
                        editBodyweight ? "col-span-2" : ""
                      }`}
                    >
                      Reps
                      <input
                        inputMode="numeric"
                        value={editReps}
                        onChange={(e) =>
                          setEditReps(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        className="mt-1 min-h-11 w-full rounded-lg bg-[var(--input)] px-2 text-base font-bold ring-1 ring-[var(--stroke)]"
                      />
                    </label>
                  </div>
                  <input
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes"
                    className="min-h-11 w-full rounded-lg bg-[var(--input)] px-3 text-sm ring-1 ring-[var(--stroke)]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveEdit(s)}
                      className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteSet(s)}
                      className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--danger)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className="flex w-full items-center justify-between py-1 text-left"
                >
                  <span className="text-[var(--muted)]">
                    Set {s.set_number}
                    {s.id.startsWith("local-") ? " · queued" : ""}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {s.weight == null ? "Bodyweight" : formatWeight(s.weight, unit)}{" "}
                    × {s.reps}
                    {s.notes ? (
                      <span className="ml-2 font-normal text-[var(--muted)]">
                        · {s.notes}
                      </span>
                    ) : null}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && targetDone && !loggingExtra && (
        <div className="border-t border-[var(--stroke)] px-4 py-3">
          <button
            type="button"
            onClick={() => setLoggingExtra(true)}
            className="w-full text-sm font-semibold text-[var(--accent-text)]"
          >
            + Extra set
          </button>
        </div>
      )}

      {showLogForm && (
        <div className="space-y-3 border-t border-[var(--stroke)] bg-[var(--canvas)]/60 px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--ink)]">
              {targetDone ? `Extra set ${nextSet}` : `Log set ${nextSet}`}
            </p>
            {!bodyweight && (
              <button
                type="button"
                onClick={() => void fetchSuggestion()}
                disabled={suggesting}
                className="text-sm font-semibold text-[var(--accent-text)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                {suggesting ? "Suggesting…" : "Suggest weight"}
              </button>
            )}
          </div>

          {!bodyweight && rationale && (
            <p className="rounded-xl bg-[var(--card)] px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {rationale}
            </p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Weight ({unitLabel(unit)})
              </label>
              <button
                type="button"
                onClick={() => {
                  // Clear any previously-fetched AI suggestion when toggling
                  // — otherwise a set saved as bodyweight can still carry a
                  // stale numeric ai_suggested_weight from before the toggle.
                  setBodyweight((b) => !b);
                  setAiSuggested(null);
                  setRationale(null);
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  bodyweight
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "bg-[var(--chip)] text-[var(--chip-ink)]"
                }`}
              >
                Bodyweight
              </button>
            </div>
            {bodyweight ? (
              <p className="flex min-h-14 items-center rounded-xl bg-[var(--input)] px-3 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
                No added weight for this set.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bumpWeight(-weightStep(unit))}
                  className="min-h-14 min-w-14 rounded-xl bg-[var(--input)] text-2xl font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] active:scale-95"
                >
                  −
                </button>
                <input
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => {
                    if (isPartialDecimal(e.target.value)) {
                      setWeight(e.target.value);
                    }
                  }}
                  className="min-h-14 w-full rounded-xl bg-[var(--input)] text-center text-2xl font-bold tabular-nums text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={() => bumpWeight(weightStep(unit))}
                  className="min-h-14 min-w-14 rounded-xl bg-[var(--input)] text-2xl font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] active:scale-95"
                >
                  +
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Reps
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bumpReps(-1)}
                className="min-h-14 min-w-14 rounded-xl bg-[var(--input)] text-2xl font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] active:scale-95"
              >
                −
              </button>
              <input
                inputMode="numeric"
                value={reps}
                onChange={(e) =>
                  setReps(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="min-h-14 w-full rounded-xl bg-[var(--input)] text-center text-2xl font-bold tabular-nums text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => bumpReps(1)}
                className="min-h-14 min-w-14 rounded-xl bg-[var(--input)] text-2xl font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)] active:scale-95"
              >
                +
              </button>
            </div>
          </div>

          {showNotes ? (
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for this set"
              className="min-h-12 w-full rounded-xl bg-[var(--input)] px-3 text-sm ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-sm font-semibold text-[var(--muted)]"
            >
              + Add note
            </button>
          )}

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <button
            type="button"
            onClick={() => void logSet()}
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Saving…" : `Save set ${nextSet}`}
          </button>
        </div>
      )}
    </section>
  );
}
