import Link from "next/link";
import { RoutineList } from "@/components/RoutineList";
import { requireBillingPage } from "@/lib/require-billing";
import { ensureUserRoutines } from "@/lib/routines";

export default async function RoutinesPage() {
  const { user, supabase } = await requireBillingPage();

  const { routines } = await ensureUserRoutines(supabase, user.id);

  return (
    <>
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            Routines
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Name, customize, and switch programs
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/exercises"
            className="min-h-11 rounded-xl bg-[var(--input)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--ink)] ring-1 ring-[var(--stroke)]"
          >
            My exercises
          </Link>
          <Link
            href="/routines/new"
            className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--accent-ink)]"
          >
            New
          </Link>
        </div>
      </header>
      <RoutineList routines={routines} />
    </>
  );
}
