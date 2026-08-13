import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { DayPicker } from "@/components/DayPicker";
import { ExerciseCard } from "@/components/ExerciseCard";
import { createClient } from "@/lib/supabase/server";
import { modeLabel, showsWeekPicker } from "@/lib/periodization";
import { WEEK_LABELS } from "@/lib/program";
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
  searchParams: Promise<{ week?: string; day?: string }>;
};

export default async function TodayPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

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

  const cycle = mode !== "none" ? await ensureCycle(supabase, user.id) : null;

  // Do not create a session until the user logs a set
  const session = await findSession(
    supabase,
    user.id,
    routine.id,
    weekFocus,
    dayNumber
  );
  const exercises = await loadDayWorkout(
    supabase,
    routine.id,
    weekFocus,
    dayNumber,
    session?.id ?? null
  );

  const completedSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const targetSets = exercises.reduce(
    (n, e) => n + e.target.target_sets,
    0
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
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <AppNav />
      <main className="flex-1 space-y-5 px-4 pb-24 pt-5">
        <header className="animate-rise">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {routine.name}
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {completedSets}/{targetSets} sets logged today · enter weight &amp;
            reps under each exercise
          </p>
        </header>

        <Suspense fallback={null}>
          <DayPicker
            weekFocus={weekFocus}
            dayNumber={dayNumber}
            days={days}
            usesPeriodization={showsWeekPicker(mode)}
          />
        </Suspense>

        <div className="space-y-3">
          {exercises.map((ex, i) => {
            const firstOpen =
              exercises.findIndex(
                (e) => e.sets.length < e.target.target_sets
              ) === i;
            return (
              <div
                key={ex.id}
                className="animate-rise"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <ExerciseCard
                  exercise={ex}
                  sessionId={session?.id ?? null}
                  weekFocus={weekFocus}
                  dayNumber={dayNumber}
                  routineId={routine.id}
                  cycleId={cycle?.id ?? null}
                  defaultOpen={firstOpen}
                />
              </div>
            );
          })}
          {exercises.length === 0 && (
            <p className="rounded-2xl bg-white/70 px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-black/5">
              No exercises on this day.{" "}
              <a
                href={`/routines/${routine.id}`}
                className="font-semibold underline"
              >
                Customize routine
              </a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
