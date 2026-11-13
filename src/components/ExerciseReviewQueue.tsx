"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { exerciseImageUrl, type CustomExercise } from "@/lib/custom-exercises";
import { formatHumanDate, localISODate } from "@/lib/program";

export function ExerciseReviewQueue({ initial }: { initial: CustomExercise[] }) {
  const router = useRouter();
  const [queue, setQueue] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function review(ex: CustomExercise, action: "approve" | "decline") {
    let note: string | null = null;
    if (action === "decline") {
      note = prompt(
        "Optional note for the creator (e.g. what to fix before resubmitting):",
        ""
      );
      if (note === null) return;
    }
    setBusyId(ex.id);
    setErrors((prev) => ({ ...prev, [ex.id]: "" }));
    try {
      const res = await fetch(`/api/admin/exercise-review/${ex.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Review failed");
      setQueue((prev) => prev.filter((e) => e.id !== ex.id));
      router.refresh();
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [ex.id]: e instanceof Error ? e.message : "Review failed",
      }));
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <p className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
        Nothing waiting for review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {queue.map((ex) => (
        <article
          key={ex.id}
          className="space-y-3 rounded-2xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]"
        >
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
              {ex.name}
            </h2>
            <p className="text-xs capitalize text-[var(--muted)]">
              {[
                ex.level,
                ex.category,
                ex.equipment,
                ex.force,
                ex.mechanic,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs capitalize text-[var(--muted)]">
              {ex.primary_muscles.join(", ")}
              {ex.secondary_muscles.length ? ` (+ ${ex.secondary_muscles.join(", ")})` : ""}
            </p>
          </div>

          {ex.images.length ? (
            <div className="grid grid-cols-4 gap-2">
              {ex.images.map((path, i) => (
                <a key={path} href={exerciseImageUrl(path)} target="_blank" rel="noreferrer">
                  <Image
                    src={exerciseImageUrl(path)}
                    alt={`${ex.name} photo ${i + 1}`}
                    width={120}
                    height={120}
                    unoptimized
                    className="aspect-square w-full rounded-xl bg-[var(--canvas)] object-cover ring-1 ring-[var(--stroke)]"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">No photos.</p>
          )}

          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--ink)]">
            {ex.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          {ex.publish_consented_at ? (
            <p className="text-[11px] text-[var(--muted)]">
              Creator agreed to public-domain release on{" "}
              {formatHumanDate(localISODate(new Date(ex.publish_consented_at)), {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              .
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busyId === ex.id}
              onClick={() => void review(ex, "approve")}
              className="min-h-11 flex-1 rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === ex.id}
              onClick={() => void review(ex, "decline")}
              className="min-h-11 flex-1 rounded-xl bg-[var(--input)] text-sm font-bold text-[var(--danger)] ring-1 ring-[var(--stroke)] disabled:opacity-60"
            >
              Decline
            </button>
          </div>
          {errors[ex.id] ? (
            <p className="text-sm text-[var(--danger)]">{errors[ex.id]}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
