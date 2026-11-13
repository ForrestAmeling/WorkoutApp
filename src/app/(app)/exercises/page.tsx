import Link from "next/link";
import { MyExercisesManager } from "@/components/MyExercisesManager";
import { listOwnCustomExercises } from "@/lib/custom-exercises";
import { requireBillingPage } from "@/lib/require-billing";

type Props = { searchParams: Promise<{ edit?: string }> };

export default async function MyExercisesPage({ searchParams }: Props) {
  const [{ edit }, { user, supabase }] = await Promise.all([
    searchParams,
    requireBillingPage(),
  ]);
  const exercises = await listOwnCustomExercises(supabase, user.id);

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
      <MyExercisesManager initial={exercises} initialEditId={edit ?? null} />
    </>
  );
}
