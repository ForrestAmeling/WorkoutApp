"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTarget } from "@/lib/program";
import type { ExerciseWithTarget, SetLog, WeekFocus } from "@/lib/types";

export function ExerciseCard({
  exercise,
  sessionId: initialSessionId,
  weekFocus,
  dayNumber,
  routineId,
  cycleId,
  defaultOpen = false,
}: {
  exercise: ExerciseWithTarget;
  sessionId: string | null;
  weekFocus: WeekFocus;
  dayNumber: number;
  routineId: string;
  cycleId: string | null;
  defaultOpen?: boolean;
}) {
  const [sets, setSets] = useState<SetLog[]>(exercise.sets);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const initiallyDone = exercise.sets.length >= exercise.target.target_sets;
  const [open, setOpen] = useState(defaultOpen && !initiallyDone);
  const [weight, setWeight] = useState<number | "">("");
  const [reps, setReps] = useState<number | "">("");
  const [aiSuggested, setAiSuggested] = useState<number | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextSet = sets.length + 1;
  const done = sets.length >= exercise.target.target_sets;
  const targetLabel = formatTarget(
    exercise.target.target_sets,
    exercise.target.rep_low,
    exercise.target.rep_high
  );

  useEffect(() => {
    if (!open || weight !== "" || sets.length > 0) return;
    void fetchSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function fetchSuggestion() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise_id: exercise.id,
          week_focus: weekFocus,
          rep_low: exercise.target.rep_low,
          rep_high: exercise.target.rep_high,
        }),
      });
      const data = await res.json();
      if (data.suggested_weight != null) {
        setWeight(Number(data.suggested_weight));
        setAiSuggested(Number(data.suggested_weight));
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
    if (sessionId) return sessionId;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");

    const performedOn = new Date().toISOString().slice(0, 10);
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

    if (createError) throw createError;
    setSessionId(created.id);
    return created.id as string;
  }

  async function logSet() {
    if (weight === "" || reps === "") {
      setError("Enter weight and reps");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    try {
      const activeSessionId = await resolveSessionId(supabase);
      const { data, error: insertError } = await supabase
        .from("set_logs")
        .insert({
          session_id: activeSessionId,
          exercise_id: exercise.id,
          set_number: nextSet,
          weight: Number(weight),
          reps: Number(reps),
          ai_suggested_weight: aiSuggested,
        })
        .select("*")
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }
      setSets((prev) => [...prev, data as SetLog]);
      setReps("");
      setAiSuggested(null);
      setRationale(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save set");
    } finally {
      setBusy(false);
    }
  }

  function bumpWeight(delta: number) {
    setWeight((w) => {
      const base = w === "" ? 0 : Number(w);
      return Math.max(0, Math.round((base + delta) * 4) / 4);
    });
  }

  function bumpReps(delta: number) {
    setReps((r) => {
      const base = r === "" ? 0 : Number(r);
      return Math.max(0, base + delta);
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl bg-white/80 ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
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
              {!open && !done ? " · Tap to log" : ""}
            </p>
          </div>
        </div>
        <span
          className={`mt-1 rounded-full px-2.5 py-1 text-xs font-bold ${
            done
              ? "bg-emerald-100 text-emerald-800"
              : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
          }`}
        >
          {sets.length}/{exercise.target.target_sets}
        </span>
      </button>

      {sets.length > 0 && (
        <ul className="space-y-1 border-t border-black/5 px-4 py-3">
          {sets.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between text-sm text-[var(--ink)]"
            >
              <span className="text-[var(--muted)]">Set {s.set_number}</span>
              <span className="font-semibold tabular-nums">
                {s.weight} lb × {s.reps}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && !done && (
        <div className="space-y-3 border-t border-black/5 bg-[var(--canvas)]/60 px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--ink)]">
              Log set {nextSet}
            </p>
            <button
              type="button"
              onClick={() => void fetchSuggestion()}
              disabled={suggesting}
              className="text-sm font-semibold text-[var(--accent-ink)] underline-offset-2 hover:underline disabled:opacity-50"
            >
              {suggesting ? "Suggesting…" : "Suggest weight"}
            </button>
          </div>

          {rationale && (
            <p className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
              {rationale}
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Weight (lb)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bumpWeight(-2.5)}
                className="min-h-14 min-w-14 rounded-xl bg-white text-2xl font-bold text-[var(--ink)] ring-1 ring-black/10 active:scale-95"
              >
                −
              </button>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) =>
                  setWeight(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="min-h-14 w-full rounded-xl bg-white text-center text-2xl font-bold tabular-nums text-[var(--ink)] ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => bumpWeight(2.5)}
                className="min-h-14 min-w-14 rounded-xl bg-white text-2xl font-bold text-[var(--ink)] ring-1 ring-black/10 active:scale-95"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Reps
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => bumpReps(-1)}
                className="min-h-14 min-w-14 rounded-xl bg-white text-2xl font-bold text-[var(--ink)] ring-1 ring-black/10 active:scale-95"
              >
                −
              </button>
              <input
                inputMode="numeric"
                value={reps}
                onChange={(e) =>
                  setReps(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="min-h-14 w-full rounded-xl bg-white text-center text-2xl font-bold tabular-nums text-[var(--ink)] ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={() => bumpReps(1)}
                className="min-h-14 min-w-14 rounded-xl bg-white text-2xl font-bold text-[var(--ink)] ring-1 ring-black/10 active:scale-95"
              >
                +
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={() => void logSet()}
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] shadow-sm transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Saving…" : `Save set ${nextSet}`}
          </button>
        </div>
      )}
    </section>
  );
}
