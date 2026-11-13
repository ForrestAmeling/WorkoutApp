import { Suspense } from "react";
import { PageLoading } from "@/components/PageLoading";
import { WorkoutSession } from "@/components/WorkoutSession";
import { requireBillingPage } from "@/lib/require-billing";
import { positionLabel, showsWeekPicker } from "@/lib/periodization";
import { isISODate, todayISO } from "@/lib/program";
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
    lastPerformedOn,
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
  const title = positionLabel(mode, weekFocus, dayName);

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
        lastPerformedOn={lastPerformedOn}
        initialExercises={exercises}
      />
    </Suspense>
  );
}
