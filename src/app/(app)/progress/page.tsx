import { ProgressDashboard } from "@/components/ProgressDashboard";
import {
  loadExerciseProgress,
  summarizeAiAccuracy,
  type AiAccuracy,
} from "@/lib/progress";
import { shiftISODate, todayISO } from "@/lib/program";
import { requireBillingPage } from "@/lib/require-billing";
import { ensureUserRoutines } from "@/lib/routines";

type Props = {
  searchParams: Promise<{ routine?: string }>;
};

export default async function ProgressPage({ searchParams }: Props) {
  const { user, supabase } = await requireBillingPage();

  const { active, routines } = await ensureUserRoutines(supabase, user.id);

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

  let aiQuery = supabase
    .from("set_logs")
    .select("weight, ai_suggested_weight, sessions!inner(user_id, routine_id)")
    .eq("sessions.user_id", user.id)
    .not("ai_suggested_weight", "is", null)
    .limit(500);
  if (scopeRoutineId) {
    aiQuery = aiQuery.eq("sessions.routine_id", scopeRoutineId);
  }

  const [exercises, { data: aiRows }] = await Promise.all([
    loadExerciseProgress(supabase, user.id, { routineId: scopeRoutineId }),
    aiQuery,
  ]);
  const aiAccuracy: AiAccuracy = summarizeAiAccuracy(aiRows ?? []);
  const weekStart = shiftISODate(todayISO(), -6);

  return (
    <>
      <header className="mb-4 animate-rise">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          Progress
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Weight, volume, and stuck lifts
        </p>
      </header>

      <ProgressDashboard
        routines={routines}
        selectedRoutineId={scopeRoutineId}
        exercises={exercises}
        aiAccuracy={aiAccuracy}
        weekStart={weekStart}
      />
    </>
  );
}
