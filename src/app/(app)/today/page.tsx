import { Suspense } from "react";
import { PageLoading } from "@/components/PageLoading";
import { WorkoutSession } from "@/components/WorkoutSession";
import { requireBillingPage } from "@/lib/require-billing";
import { modeLabel, showsWeekPicker } from "@/lib/periodization";
import { isISODate, todayISO, WEEK_LABELS } from "@/lib/program";
import {
  loadTodayPageData,
  routineMode,
} from "@/lib/workout";

type Props = {
  searchParams: Promise<{
    week?: string;
    day?: string;
    date?: string;
    reset?: string;
  }>;
};

export default async function TodayPage({ searchParams }: Props) {
  const params = await searchParams;
  const { user, supabase } = await requireBillingPage();

  const explicitDate = isISODate(params.date) ? params.date : null;
  const requestedOn = explicitDate ?? todayISO();
  const {
    routine,
    days,
    weekFocus,
    dayNumber,
    cycle,
    session,
    performedOn,
    exercises,
  } = await loadTodayPageData(supabase, user.id, {
    explicitDate,
    requestedOn,
    reset: params.reset === "1",
    week: params.week,
    day: params.day,
  });

  const mode = routineMode(routine);
  const dayName =
    days.find((d) => d.day_number === dayNumber)?.name ?? `Day ${dayNumber}`;
  const title =
    mode === "full"
      ? `${WEEK_LABELS[weekFocus]} · ${dayName}`
      : mode === "none"
        ? dayName
        : `${modeLabel(mode)} · ${dayName}`;

  return (
    <Suspense fallback={<PageLoading label="Loading workout…" />}>
      <WorkoutSession
        title={title}
        routineName={routine.name}
        days={days}
        weekFocus={weekFocus}
        dayNumber={dayNumber}
        usesPeriodization={showsWeekPicker(mode)}
        periodizationMode={mode}
        sessionId={session?.id ?? null}
        cycleId={cycle.id}
        routineId={routine.id}
        performedOn={performedOn}
        initialExercises={exercises}
      />
    </Suspense>
  );
}
