"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LibraryExercise } from "@/lib/types";

export function ExerciseHowToButton({
  libraryId,
  name,
  exercise,
  onSwitch,
}: {
  libraryId?: string | null;
  name: string;
  exercise?: LibraryExercise | null;
  onSwitch?: (ex: LibraryExercise) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-[var(--accent-text)]"
      >
        How to
      </button>
      {open ? (
        <ExerciseHowToSheet
          libraryId={libraryId}
          name={name}
          preset={exercise ?? null}
          onSwitch={onSwitch}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ExerciseHowToSheet({
  libraryId,
  name,
  preset,
  onSwitch,
  onClose,
}: {
  libraryId?: string | null;
  name: string;
  preset: LibraryExercise | null;
  onSwitch?: (ex: LibraryExercise) => void | Promise<void>;
  onClose: () => void;
}) {
  const [guide, setGuide] = useState<LibraryExercise | null>(preset);
  const [loading, setLoading] = useState(!preset);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [searchQ, setSearchQ] = useState(name);
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const canSwitch =
    Boolean(onSwitch && guide) && guide!.id !== (libraryId ?? "");

  useEffect(() => {
    if (preset) return;
    const params = new URLSearchParams({ name });
    if (libraryId) params.set("id", libraryId);
    void fetch(`/api/exercise-library?${params}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 404) {
          setGuide(null);
          setShowSearch(true);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Guide not found");
        setGuide(data.exercise ?? null);
        if (!data.exercise) setShowSearch(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Guide not found");
        setShowSearch(true);
      })
      .finally(() => setLoading(false));
  }, [libraryId, name, preset]);

  useEffect(() => {
    if (!showSearch) return;
    const q = searchQ.trim();
    const t = window.setTimeout(() => {
      void runSearch(q);
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, showSearch]);

  async function switchToGuide(ex: LibraryExercise) {
    if (!onSwitch) return;
    setSwitching(true);
    setError(null);
    try {
      await onSwitch(ex);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch exercise");
      setSwitching(false);
    }
  }

  async function runSearch(q: string) {
    setSearching(true);
    const params = new URLSearchParams({ limit: "12" });
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/exercise-library?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const images = guide?.images?.length
    ? guide.images
    : guide?.imageUrl
      ? [guide.imageUrl]
      : [];
  const meta = [
    guide?.level,
    guide?.equipment,
    guide?.primaryMuscles[0],
  ].filter(Boolean);

  const sheet = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[var(--surface)] shadow-[var(--shadow)] ring-1 ring-[var(--stroke)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--stroke)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--ink)]">
              {guide && !showSearch ? guide.name : name}
            </h2>
            {guide && !showSearch && meta.length > 0 ? (
              <p className="mt-0.5 text-xs capitalize text-[var(--muted)]">
                {meta.join(" · ")}
              </p>
            ) : showSearch ? (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {onSwitch
                  ? "Pick the right movement, then switch this slot to it."
                  : "Search free-exercise-db for the matching movement."}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--muted)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading guide…</p>
          ) : null}

          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}

          {guide && !showSearch ? (
            <>
              {images.length > 0 ? (
                <div
                  className={`grid gap-2 ${
                    images.length > 1 ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {images.map((src, i) => (
                    <figure key={src} className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${guide.name} position ${i + 1}`}
                        className="aspect-square w-full rounded-2xl bg-[var(--canvas)] object-cover ring-1 ring-[var(--stroke)]"
                      />
                      <figcaption className="mt-1 text-center text-xs font-semibold text-[var(--muted)]">
                        {images.length === 2
                          ? i === 0
                            ? "Start"
                            : "Finish"
                          : `Step ${i + 1}`}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}

              {guide.instructions.length > 0 ? (
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--ink)]">
                  {guide.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  Photos are available, but this exercise has no written steps.
                </p>
              )}

              <p className="text-[11px] text-[var(--muted)]">
                Form photos and steps from free-exercise-db.
              </p>
              {canSwitch ? (
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => void switchToGuide(guide!)}
                  className="min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
                >
                  {switching ? "Switching…" : `Switch this slot to ${guide!.name}`}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                className="text-sm font-semibold text-[var(--accent-text)]"
              >
                Wrong exercise? Search the library
              </button>
            </>
          ) : null}

          {showSearch ? (
            <div className="space-y-3">
              {!guide && !loading ? (
                <p className="text-sm text-[var(--ink)]">
                  No automatic match for “{name}”. Search the library — names
                  like “Incline DB press” map to Incline Dumbbell Press.
                </p>
              ) : null}
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search exercises…"
                autoFocus
                className="min-h-12 w-full rounded-xl bg-[var(--input)] px-3 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <ul className="space-y-2">
                {searching ? (
                  <li className="text-sm text-[var(--muted)]">Searching…</li>
                ) : null}
                {!searching &&
                  results.map((ex) => (
                    <li key={ex.id}>
                      <div className="flex items-center gap-2 rounded-2xl bg-[var(--card)] px-3 py-2 ring-1 ring-[var(--stroke)]">
                        <button
                          type="button"
                          onClick={() => {
                            setGuide(ex);
                            setShowSearch(false);
                            setError(null);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ex.imageUrl ?? "/icon-192.png"}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-xl object-cover bg-[var(--canvas)]"
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
                        {onSwitch && ex.id !== (libraryId ?? "") ? (
                          <button
                            type="button"
                            disabled={switching}
                            onClick={() => void switchToGuide(ex)}
                            className="shrink-0 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-60"
                          >
                            Switch
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                {!searching && results.length === 0 ? (
                  <li className="text-sm text-[var(--muted)]">
                    No library exercises matched that search.
                  </li>
                ) : null}
              </ul>
              {guide ? (
                <button
                  type="button"
                  onClick={() => setShowSearch(false)}
                  className="text-sm font-semibold text-[var(--muted)]"
                >
                  Back to guide
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}