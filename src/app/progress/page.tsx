import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { loadExerciseProgress } from "@/lib/progress";
import { ensureUserRoutines, getActiveRoutine, listRoutines } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ routine?: string }>;
};

export default async function ProgressPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureUserRoutines(supabase, user.id);
  const routines = await listRoutines(supabase, user.id);
  const active = await getActiveRoutine(supabase, user.id);

  const params = await searchParams;
  let scopeRoutineId: string | null;
  if (params.routine === "all" || params.routine === "") {
    scopeRoutineId = null;
  } else if (
    params.routine &&
    routines.some((r) => r.id === params.routine)
  ) {
    scopeRoutineId = params.routine;
  } else {
    scopeRoutineId = active?.id ?? null;
  }

  const exercises = await loadExerciseProgress(supabase, user.id, {
    routineId: scopeRoutineId,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <AppNav />
      <main className="flex-1 space-y-4 px-4 pb-24 pt-5">
        <header className="animate-rise">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            Progress
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Weight and reps over time for each lift
          </p>
        </header>

        <ProgressDashboard
          routines={routines}
          selectedRoutineId={scopeRoutineId}
          exercises={exercises}
        />
      </main>
    </div>
  );
}
