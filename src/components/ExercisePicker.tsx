"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ExerciseHowToButton } from "@/components/ExerciseHowTo";
import { customLibraryExercise, safeExerciseImageUrl } from "@/lib/exercise-library";
import type { LibraryExercise } from "@/lib/types";

export function ExercisePicker({
  onPick,
  onClose,
}: {
  onPick: (ex: LibraryExercise) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipList, setEquipList] = useState<string[]>([]);
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/exercise-library?meta=1")
      .then((r) => r.json())
      .then((d) => {
        setMuscles(d.muscles ?? []);
        setEquipList(d.equipment ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, muscle, equipment]);

  async function runSearch() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (muscle) params.set("muscle", muscle);
    if (equipment) params.set("equipment", equipment);
    params.set("limit", "30");
    try {
      const res = await fetch(`/api/exercise-library?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      // Clear stale results instead of leaving the previous successful
      // search's list on screen next to an error for a query it no longer
      // matches — matches ExerciseHowTo.tsx's search, which already does
      // this.
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--stroke)]">
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
            Add exercise
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)]"
          >
            Close
          </button>
        </div>

        <div className="space-y-2 border-b border-[var(--stroke)] px-4 py-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search free-exercise-db…"
            className="min-h-12 w-full rounded-xl bg-[var(--input)] px-3 text-base ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <div className="flex gap-2">
            <select
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="min-h-11 flex-1 rounded-xl bg-[var(--input)] px-2 text-sm ring-1 ring-[var(--stroke)]"
            >
              <option value="">All muscles</option>
              {muscles.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="min-h-11 flex-1 rounded-xl bg-[var(--input)] px-2 text-sm ring-1 ring-[var(--stroke)]"
            >
              <option value="">All equipment</option>
              {equipList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {q.trim() && (
            <li className="rounded-2xl bg-[var(--card)] px-3 py-2 ring-1 ring-[var(--stroke)]">
              <button
                type="button"
                onClick={() => onPick(customLibraryExercise(q.trim()))}
                className="w-full text-left text-sm font-semibold text-[var(--accent-text)]"
              >
                + Add “{q.trim()}” as your own exercise
              </button>
            </li>
          )}
          {loading && (
            <li className="px-2 py-4 text-sm text-[var(--muted)]">Searching…</li>
          )}
          {error && (
            <li className="px-2 py-4 text-sm text-[var(--danger)]">{error}</li>
          )}
          {!loading &&
            results.map((ex) => (
              <li
                key={ex.id}
                className="flex items-center gap-2 rounded-2xl bg-[var(--card)] px-3 py-2 ring-1 ring-[var(--stroke)]"
              >
                <button
                  type="button"
                  onClick={() => onPick(ex)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:scale-[0.99]"
                >
                  <Image
                    src={safeExerciseImageUrl(ex.imageUrl)}
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-xl object-cover bg-[var(--canvas)]"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--ink)]">
                      {ex.name}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {[ex.primaryMuscles[0], ex.equipment]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </button>
                <ExerciseHowToButton
                  libraryId={ex.id}
                  name={ex.name}
                  exercise={ex}
                />
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
