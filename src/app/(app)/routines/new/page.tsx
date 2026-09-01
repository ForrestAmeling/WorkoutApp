import Link from "next/link";
import { NewRoutineForm } from "@/components/NewRoutineForm";
import { requireBillingPage } from "@/lib/require-billing";

export default async function NewRoutinePage() {
  await requireBillingPage();

  return (
    <>
      <Link
        href="/routines"
        className="text-sm font-semibold text-[var(--muted)]"
      >
        ← Routines
      </Link>
      <header className="mt-3 mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          New routine
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick days/week, then build or let AI draft it. Exercises come from
          free-exercise-db.
        </p>
      </header>
      <NewRoutineForm />
    </>
  );
}
