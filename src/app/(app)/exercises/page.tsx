import Link from "next/link";
import { MyExercisesManager } from "@/components/MyExercisesManager";
import { isAppAdmin } from "@/lib/app-admin";
import { listOwnCustomExercises } from "@/lib/custom-exercises";
import { requireBillingPage } from "@/lib/require-billing";

type Props = { searchParams: Promise<{ edit?: string }> };

export default async function MyExercisesPage({ searchParams }: Props) {
  const [{ edit }, { user, supabase }] = await Promise.all([
    searchParams,
    requireBillingPage(),
  ]);
  const [exercises, admin] = await Promise.all([
    listOwnCustomExercises(supabase, user.id),
    isAppAdmin(supabase, user.id),
  ]);
  const { count: awaitingReview } = admin
    ? await supabase
        .from("custom_exercises")
        .select("id", { count: "exact", head: true })
        .eq("publish_status", "requested")
    : { count: null };

  return (
    <>
      <Link href="/routines" className="text-sm font-semibold text-[var(--muted)]">
        ← Routines
      </Link>
      <header className="mt-3 mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          My exercises
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your own moves with photos and steps. Pick them in any routine; share
          one to let other Reps users add it too.
        </p>
      </header>
      {admin ? (
        <Link
          href="/exercises/review"
          className="mb-4 block rounded-2xl bg-[var(--card)] px-4 py-3 text-sm font-semibold text-[var(--accent-text)] ring-1 ring-[var(--stroke)]"
        >
          Review free-exercise-db submissions
          {awaitingReview ? ` (${awaitingReview} waiting)` : ""} →
        </Link>
      ) : null}
      <MyExercisesManager initial={exercises} initialEditId={edit ?? null} />
    </>
  );
}
