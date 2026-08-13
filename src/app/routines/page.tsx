import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { RoutineList } from "@/components/RoutineList";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRoutines, listRoutines } from "@/lib/routines";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureUserRoutines(supabase, user.id);
  const routines = await listRoutines(supabase, user.id);

  return (
    <AppShell>
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            Routines
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Name, customize, and switch programs
          </p>
        </div>
        <Link
          href="/routines/new"
          className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold leading-[2.75rem] text-[var(--accent-ink)]"
        >
          New
        </Link>
      </header>
      <RoutineList routines={routines} />
    </AppShell>
  );
}
