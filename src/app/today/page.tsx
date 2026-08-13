import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { WorkoutSession } from "@/components/WorkoutSession";
import { createClient } from "@/lib/supabase/server";
import { modeLabel, showsWeekPicker } from "@/lib/periodization";
import { isISODate, todayISO, WEEK_LABELS } from "@/lib/program";
import {
  ensureCycle,
  findSession,
  loadActiveWorkoutContext,
  loadDayWorkout,
  parseDayNumber,
  parseWeekFocus,
  resolveDefaultDay,
  routineMode,
} from "@/lib/workout";

type Props = {
  searchParams: Promise<{ week?: string; day?: string; date?: string }>;
};

export default async function TodayPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const performedOn = isISODate(params.date) ? params.date : todayISO();
  const { routine, days } = await loadActiveWorkoutContext(supabase, user.id);
  const mode = routineMode(routine);
  const maxDay = days.length || 1;
  const defaults = await resolveDefaultDay(
    supabase,
    user.id,
    routine,
    maxDay
  );
  const weekFocus = showsWeekPicker(mode)
    ? parseWeekFocus(params.week) ?? defaults.weekFocus
    : defaults.weekFocus;
  const dayNumber =
    parseDayNumber(params.day, maxDay) ?? defaults.dayNumber;

  const cycle =
    mode !== "none"
      ? await ensureCycle(supabase, user.id, {
          startNext: defaults.wrappedCycle,
          startedOn: performedOn,
        })
      : null;

  const session = await findSession(
    supabase,
    user.id,
    routine.id,
    weekFocus,
    dayNumber,
    performedOn
  );
  const exercises = await loadDayWorkout(
    supabase,
    routine.id,
    weekFocus,
    dayNumber,
    session?.id ?? null
  );

  const dayName =
    days.find((d) => d.day_number === dayNumber)?.name ?? `Day ${dayNumber}`;

  const title =
    mode === "full"
      ? `${WEEK_LABELS[weekFocus]} · ${dayName}`
      : mode === "none"
        ? dayName
        : `${modeLabel(mode)} · ${dayName}`;

  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
        <WorkoutSession
          title={title}
          routineName={routine.name}
          days={days}
          weekFocus={weekFocus}
          dayNumber={dayNumber}
          usesPeriodization={showsWeekPicker(mode)}
          sessionId={session?.id ?? null}
          cycleId={cycle?.id ?? null}
          routineId={routine.id}
          performedOn={performedOn}
          initialExercises={exercises}
        />
      </Suspense>
    </AppShell>
  );
}
