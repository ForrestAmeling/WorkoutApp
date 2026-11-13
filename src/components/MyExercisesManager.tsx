"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { CustomExerciseForm } from "@/components/CustomExerciseForm";
import { exerciseImageUrl, type CustomExercise } from "@/lib/custom-exercises";

export function MyExercisesManager({
  initial,
  initialEditId,
}: {
  initial: CustomExercise[];
  initialEditId?: string | null;
}) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initial);
  // undefined = closed, null = new, otherwise the exercise being edited
  const [editing, setEditing] = useState<CustomExercise | null | undefined>(
    initial.find((e) => e.id === initialEditId)
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(ex: CustomExercise) {
    if (
      !confirm(
        `Delete “${ex.name}”? Routines that use it keep the exercise and its logged history, just without the photos and steps.`
      )
    ) {
      return;
    }
    setBusyId(ex.id);
    setError(null);
    try {
      const res = await fetch(`/api/my-exercises/${ex.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setEditing(null)}
        className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)]"
      >
        + New exercise
      </button>

      {exercises.length === 0 ? (
        <p className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
          Nothing here yet. Exercises you create show up first in the exercise
          picker when you build or edit a routine.
        </p>
      ) : null}

      {exercises.map((ex) => (
        <article
          key={ex.id}
          className="flex items-center gap-3 rounded-2xl bg-[var(--card)] p-3 ring-1 ring-[var(--stroke)]"
        >
          <Image
            src={ex.images[0] ? exerciseImageUrl(ex.images[0]) : "/icon-192.png"}
            alt=""
            width={56}
            height={56}
            unoptimized={Boolean(ex.images[0])}
            className="h-14 w-14 shrink-0 rounded-xl bg-[var(--canvas)] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--ink)]">{ex.name}</p>
            <p className="truncate text-xs capitalize text-[var(--muted)]">
              {[ex.primary_muscles[0], ex.equipment].filter(Boolean).join(" · ") ||
                "No details yet"}
            </p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                ex.visibility === "shared"
                  ? "bg-[var(--chip)] text-[var(--chip-ink)]"
                  : "bg-[var(--input)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
              }`}
            >
              {ex.visibility === "shared" ? "Shared" : "Private"}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setEditing(ex)}
              className="min-h-9 rounded-lg px-3 text-sm font-semibold text-[var(--accent-text)]"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busyId === ex.id}
              onClick={() => void remove(ex)}
              className="min-h-9 rounded-lg px-3 text-sm font-semibold text-[var(--danger)] disabled:opacity-60"
            >
              {busyId === ex.id ? "Deleting…" : "Delete"}
            </button>
          </div>
        </article>
      ))}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {editing !== undefined ? (
        <CustomExerciseForm
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSaved={({ exercise }) => {
            setExercises((prev) =>
              [...prev.filter((e) => e.id !== exercise.id), exercise].sort((a, b) =>
                a.name.localeCompare(b.name)
              )
            );
            setEditing(undefined);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
