"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { modeLabel, parsePeriodizationMode } from "@/lib/periodization";
import type { Routine } from "@/lib/types";

export function RoutineList({ routines: initial }: { routines: Routine[] }) {
  const router = useRouter();
  const [routines, setRoutines] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activate(id: string) {
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setBusyId(null);
      return;
    }
    await supabase
      .from("routines")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .neq("id", id);
    const { error: err } = await supabase
      .from("routines")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    setRoutines((prev) =>
      prev.map((r) => ({ ...r, is_active: r.id === id }))
    );
    router.refresh();
  }

  async function remove(id: string) {
    if (routines.length <= 1) {
      setError("Keep at least one routine");
      return;
    }
    if (!confirm("Delete this routine? Logged sessions stay in history.")) return;
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const wasActive = routines.find((r) => r.id === id)?.is_active;
    const { error: err } = await supabase.from("routines").delete().eq("id", id);
    if (err) {
      setBusyId(null);
      setError(err.message);
      return;
    }
    const next = routines.filter((r) => r.id !== id);
    if (wasActive && next[0]) {
      await supabase
        .from("routines")
        .update({ is_active: true })
        .eq("id", next[0].id);
      next[0] = { ...next[0], is_active: true };
    }
    setRoutines(next);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {routines.map((r) => (
        <article
          key={r.id}
          className="rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
                {r.name}
              </p>
              <p className="text-sm text-[var(--muted)]">
                {modeLabel(
                  parsePeriodizationMode(r.periodization_mode) ??
                    (r.uses_periodization ? "full" : "none")
                )}{" "}
                · {r.source}
                {r.is_active ? " · Active" : ""}
              </p>
            </div>
            {r.is_active && (
              <span className="rounded-full bg-[var(--chip)] px-2.5 py-1 text-xs font-bold text-[var(--chip-ink)]">
                Active
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.is_active ? (
              <Link
                href="/today"
                className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--accent-ink)]"
              >
                Log on Today
              </Link>
            ) : (
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={async () => {
                  await activate(r.id);
                  router.push("/today");
                }}
                className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)]"
              >
                Set active & log
              </button>
            )}
            <Link
              href={`/routines/${r.id}`}
              className="min-h-11 rounded-xl bg-[var(--solid)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--on-solid)]"
            >
              Customize
            </Link>
            <Link
              href={`/progress?routine=${encodeURIComponent(r.id)}`}
              className="min-h-11 rounded-xl bg-[var(--input)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--ink)] ring-1 ring-[var(--stroke)]"
            >
              Progress
            </Link>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={async () => {
                setBusyId(r.id);
                setError(null);
                try {
                  const res = await fetch(`/api/routines/${r.id}/copy`, {
                    method: "POST",
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Copy failed");
                  router.push(`/routines/${data.routine.id}`);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Copy failed");
                  setBusyId(null);
                }
              }}
              className="min-h-11 rounded-xl bg-[var(--input)] px-4 text-sm font-bold text-[var(--ink)] ring-1 ring-[var(--stroke)]"
            >
              {busyId === r.id ? "Copying…" : "Copy"}
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => void remove(r.id)}
              className="min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--danger)]"
            >
              Delete
            </button>
          </div>
        </article>
      ))}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
