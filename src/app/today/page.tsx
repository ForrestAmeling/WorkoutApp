import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { WorkoutSession } from "@/components/WorkoutSession";
import { requireBillingPage } from "@/lib/require-billing";
import { modeLabel, showsWeekPicker } from "@/lib/periodization";
import { isISODate, todayISO, WEEK_LABELS } from "@/lib/program";
import { billingNotice } from "@/lib/subscription-access";
import type { Session } from "@/lib/types";
import {
  ensureCycle,
  findCycleSession,
  findSession,
  loadActiveWorkoutContext,
  loadDayWorkout,
  parseDayNumber,
  parseWeekFocus,
  resolveDefaultDay,
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
  const { user, supabase, subscription } = await requireBillingPage();

  const explicitDate = isISODate(params.date) ? params.date : null;
  const requestedOn = explicitDate ?? todayISO();
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

  // Every routine gets a cycle, periodized or not, so a completed pass
  // through its days can be told apart from a fresh one (see
  // findCycleSession below). WorkoutSession's "Reset — Start …" button
  // always adds ?reset=1 so a new cycle starts reliably the instant it's
  // tapped — resolveDefaultDay's own wrap detection alone would miss a
  // same-day reset, since its "resume today's in-progress session"
  // short-circuit returns wrappedCycle: false regardless of whether
  // today's session was actually the block's last day.
  const cycle = await ensureCycle(supabase, user.id, {
    startNext: params.reset === "1" || defaults.wrappedCycle,
    startedOn: requestedOn,
  });

  // An explicit date (from the date strip) always means "show me exactly
  // that calendar day." Otherwise — browsing via the day/week picker —
  // find this slot's session within the *current* cycle regardless of
  // which date it actually happened on, so a day finished earlier this
  // cycle keeps showing its completed sets instead of looking freshly
  // unstarted just because "today" has moved on.
  let session: Session | null;
  let performedOn: string;
  if (explicitDate) {
    performedOn = explicitDate;
    session = await findSession(
      supabase,
      user.id,
      routine.id,
      weekFocus,
      dayNumber,
      performedOn
    );
  } else {
    session = await findCycleSession(
      supabase,
      user.id,
      routine.id,
      cycle.id,
      weekFocus,
      dayNumber
    );
    performedOn = session?.performed_on ?? requestedOn;
  }

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
    <AppShell
      billingNotice={billingNotice(subscription)}
      trialEnd={subscription?.trial_end}
    >
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
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
    </AppShell>
  );
}
