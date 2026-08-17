"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSettings } from "@/components/SettingsProvider";
import {
  displayToLb,
  formatWeight,
  isPartialDecimal,
  lbToDisplay,
  unitLabel,
} from "@/lib/units";

type HistorySetRowData = {
  id: string;
  set_number: number;
  weight: number | null;
  reps: number | null;
  ai_suggested_weight: number | null;
  notes: string | null;
};

/** A single logged set inside a History session, editable in place. */
export function HistorySetRow({ row }: { row: HistorySetRowData }) {
  const router = useRouter();
  const { settings } = useSettings();
  const unit = settings.unit;

  const [current, setCurrent] = useState(row);
  const [editing, setEditing] = useState(false);
  const [bodyweight, setBodyweight] = useState(row.weight == null);
  const [weight, setWeight] = useState(
    row.weight == null ? "" : String(lbToDisplay(Number(row.weight), unit))
  );
  const [reps, setReps] = useState<number | "">(row.reps ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setBodyweight(current.weight == null);
    setWeight(
      current.weight == null
        ? ""
        : String(lbToDisplay(Number(current.weight), unit))
    );
    setReps(current.reps ?? "");
    setNotes(current.notes ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if ((!bodyweight && weight === "") || reps === "") {
      setError("Enter weight and reps");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const lb = bodyweight ? null : displayToLb(Number(weight), unit);
    const nextReps = Number(reps);
    const nextNotes = notes.trim() || null;
    const { error: updateError } = await supabase
      .from("set_logs")
      .update({ weight: lb, reps: nextReps, notes: nextNotes })
      .eq("id", row.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCurrent((c) => ({ ...c, weight: lb, reps: nextReps, notes: nextNotes }));
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this set?")) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: delError } = await supabase
      .from("set_logs")
      .delete()
      .eq("id", row.id);
    setBusy(false);
    if (delError) {
      setError(delError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <li>
        <button
          type="button"
          onClick={startEdit}
          className="flex w-full items-center justify-between py-1 text-left text-sm text-[var(--ink)]"
        >
          <span className="text-[var(--muted)]">Set {current.set_number}</span>
          <span className="tabular-nums font-semibold">
            {current.weight == null
              ? "Bodyweight"
              : formatWeight(current.weight, unit)}{" "}
            × {current.reps}
            {current.ai_suggested_weight != null && (
              <span className="ml-2 font-normal text-[var(--muted)]">
                (AI {formatWeight(current.ai_suggested_weight, unit)})
              </span>
            )}
            {current.notes ? (
              <span className="ml-2 font-normal text-[var(--muted)]">
                · {current.notes}
              </span>
            ) : null}
          </span>
        </button>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </li>
    );
  }

  return (
    <li className="space-y-2 rounded-xl bg-[var(--canvas)]/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Edit set {current.set_number}
        </p>
        <button
          type="button"
          onClick={() => setBodyweight((b) => !b)}
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            bodyweight
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--chip)] text-[var(--chip-ink)]"
          }`}
        >
          Bodyweight
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {!bodyweight && (
          <label className="text-xs text-[var(--muted)]">
            {unitLabel(unit)}
            <input
              inputMode="decimal"
              value={weight}
              onChange={(e) => {
                if (isPartialDecimal(e.target.value)) setWeight(e.target.value);
              }}
              className="mt-1 min-h-11 w-full rounded-lg bg-[var(--input)] px-2 text-base font-bold ring-1 ring-[var(--stroke)]"
            />
          </label>
        )}
        <label
          className={`text-xs text-[var(--muted)] ${
            bodyweight ? "col-span-2" : ""
          }`}
        >
          Reps
          <input
            inputMode="numeric"
            value={reps}
            onChange={(e) =>
              setReps(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="mt-1 min-h-11 w-full rounded-lg bg-[var(--input)] px-2 text-base font-bold ring-1 ring-[var(--stroke)]"
          />
        </label>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="min-h-11 w-full rounded-lg bg-[var(--input)] px-3 text-sm ring-1 ring-[var(--stroke)]"
      />
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--muted)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--danger)]"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
