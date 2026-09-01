import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultWeekFocus,
  parsePeriodizationMode,
  showsWeekPicker,
  type PeriodizationMode,
} from "./periodization";
import { nextPosition, todayISO, WEEK_FOCI } from "./program";
import { ensureUserRoutines, getRoutineDays } from "./routines";
import type {
  Cycle,
  Exercise,
  ExerciseTarget,
  ExerciseWithTarget,
  Routine,
  RoutineDay,
  Session,
  SetLog,
  WeekFocus,
} from "./types";

type LastLoggedSession = {
  week_focus: WeekFocus;
  day_number: number;
  performed_on: string;
};

type SessionWithLogs = Session & { set_logs?: SetLog[] };

type ExerciseWithTargets = Exercise & {
  exercise_targets?: ExerciseTarget[];
};

export function routineMode(routine: Routine): PeriodizationMode {
  return (
    parsePeriodizationMode(routine.periodization_mode) ??
    (routine.uses_periodization ? "full" : "none")
  );
}

async function fetchLatestCycle(
  supabase: SupabaseClient,
  userId: string
): Promise<Cycle | null> {
  const { data, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Cycle) ?? null;
}

async function continueCycle(
  supabase: SupabaseClient,
  userId: string,
  existing: Cycle | null,
  opts?: { startNext?: boolean; startedOn?: string }
): Promise<Cycle> {
  const startedOn = opts?.startedOn ?? todayISO();

  if (existing && !opts?.startNext) return existing;

  if (existing && opts?.startNext) {
    if (existing.started_on >= startedOn) return existing;
    const { data, error } = await supabase
      .from("cycles")
      .insert({
        user_id: userId,
        cycle_number: existing.cycle_number + 1,
        started_on: startedOn,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as Cycle;
  }

  const { data, error } = await supabase
    .from("cycles")
    .insert({ user_id: userId, cycle_number: 1, started_on: startedOn })
    .select("*")
    .single();

  if (error) throw error;
  return data as Cycle;
}

export async function ensureCycle(
  supabase: SupabaseClient,
  userId: string,
  opts?: { startNext?: boolean; startedOn?: string }
): Promise<Cycle> {
  const existing = await fetchLatestCycle(supabase, userId);
  return continueCycle(supabase, userId, existing, opts);
}

async function fetchLastLoggedSession(
  supabase: SupabaseClient,
  userId: string,
  routineId: string
): Promise<LastLoggedSession | null> {
  // Only advance from sessions that actually have logged sets
  const { data, error } = await supabase
    .from("sessions")
    .select("week_focus, day_number, performed_on, set_logs!inner(id)")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LastLoggedSession) ?? null;
}

function defaultDayFromLast(
  last: LastLoggedSession | null,
  routine: Routine,
  maxDay: number
): {
  weekFocus: WeekFocus;
  dayNumber: number;
  wrappedCycle: boolean;
} {
  const mode = routineMode(routine);

  if (!last) {
    return {
      weekFocus: defaultWeekFocus(mode),
      dayNumber: 1,
      wrappedCycle: false,
    };
  }

  // The most recently-logged session is today's own (still in progress) —
  // resume it instead of advancing to the next day/focus. Without this,
  // logging even a single set today makes the bare "Today" link (e.g. the
  // bottom-nav tab, clicked from History) jump straight to tomorrow.
  if (last.performed_on === todayISO()) {
    return {
      weekFocus: showsWeekPicker(mode)
        ? last.week_focus
        : defaultWeekFocus(mode),
      dayNumber: Math.min(last.day_number, maxDay),
      wrappedCycle: false,
    };
  }

  if (!showsWeekPicker(mode)) {
    const nextDay = last.day_number >= maxDay ? 1 : last.day_number + 1;
    return {
      weekFocus: defaultWeekFocus(mode),
      dayNumber: nextDay,
      wrappedCycle: last.day_number >= maxDay,
    };
  }

  const next = nextPosition(
    last.week_focus,
    Math.min(last.day_number, maxDay),
    maxDay
  );
  const wrappedCycle =
    last.week_focus === "heavy" &&
    last.day_number >= maxDay &&
    next.weekFocus === "light" &&
    next.dayNumber === 1;

  return { ...next, wrappedCycle };
}

export async function resolveDefaultDay(
  supabase: SupabaseClient,
  userId: string,
  routine: Routine,
  maxDay: number
): Promise<{
  weekFocus: WeekFocus;
  dayNumber: number;
  wrappedCycle: boolean;
}> {
  const last = await fetchLastLoggedSession(supabase, userId, routine.id);
  return defaultDayFromLast(last, routine, maxDay);
}

/** Find today's session if it already exists — does not create. */
export async function findSession(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  weekFocus: WeekFocus,
  dayNumber: number,
  performedOn = todayISO()
): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .eq("performed_on", performedOn)
    .eq("week_focus", weekFocus)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as Session) ?? null;
}

/** Find the most recent session logged for this exact (week focus, day
 * number) slot within the given cycle, regardless of which calendar date
 * it was actually performed on. Used when the day/week picker (not the
 * date strip) is driving navigation: a day finished earlier in the same
 * cycle should keep showing its completed sets instead of looking like a
 * fresh, unstarted day just because "today" has moved on. */
export async function findCycleSession(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  cycleId: string | null,
  weekFocus: WeekFocus,
  dayNumber: number
): Promise<Session | null> {
  if (!cycleId) return null;
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .eq("cycle_id", cycleId)
    .eq("week_focus", weekFocus)
    .eq("day_number", dayNumber)
    .order("performed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Session) ?? null;
}

/** Create session only when the first set is logged. */
export async function ensureSession(
  supabase: SupabaseClient,
  userId: string,
  routine: Routine,
  cycle: Cycle | null,
  weekFocus: WeekFocus,
  dayNumber: number,
  performedOn = todayISO()
): Promise<Session> {
  const existing = await findSession(
    supabase,
    userId,
    routine.id,
    weekFocus,
    dayNumber,
    performedOn
  );
  if (existing) return existing;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      cycle_id: cycle?.id ?? null,
      routine_id: routine.id,
      week_focus: weekFocus,
      day_number: dayNumber,
      performed_on: performedOn,
    })
    .select("*")
    .single();

  if (error) {
    // Unique constraint race: another card created the session first.
    const raced = await findSession(
      supabase,
      userId,
      routine.id,
      weekFocus,
      dayNumber,
      performedOn
    );
    if (raced) return raced;
    throw error;
  }
  return data as Session;
}

function pickTarget(
  targets: ExerciseTarget[],
  weekFocus: WeekFocus
): ExerciseTarget | undefined {
  return (
    targets.find((t) => t.week_focus === weekFocus) ??
    targets.find((t) => t.week_focus === "middle")
  );
}

function stitchExercises(
  exercises: ExerciseWithTargets[],
  weekFocus: WeekFocus,
  sets: SetLog[]
): ExerciseWithTarget[] {
  const setsByEx = new Map<string, SetLog[]>();
  for (const s of sets) {
    const list = setsByEx.get(s.exercise_id) ?? [];
    list.push(s);
    setsByEx.set(s.exercise_id, list);
  }
  for (const list of setsByEx.values()) {
    list.sort((a, b) => a.set_number - b.set_number);
  }

  return exercises
    .map((ex) => {
      const { exercise_targets, ...rest } = ex;
      const target = pickTarget(exercise_targets ?? [], weekFocus);
      if (!target) return null;
      return {
        ...rest,
        target,
        sets: setsByEx.get(ex.id) ?? [],
      } as ExerciseWithTarget;
    })
    .filter(Boolean) as ExerciseWithTarget[];
}

async function loadExercisesWithTargets(
  supabase: SupabaseClient,
  routineId: string,
  dayNumber: number
): Promise<ExerciseWithTargets[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*, exercise_targets(*)")
    .eq("routine_id", routineId)
    .eq("day_number", dayNumber)
    .eq("is_template", false)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ExerciseWithTargets[];
}

async function findSessionWithLogs(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  weekFocus: WeekFocus,
  dayNumber: number,
  performedOn: string
): Promise<SessionWithLogs | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*, set_logs(*)")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .eq("performed_on", performedOn)
    .eq("week_focus", weekFocus)
    .eq("day_number", dayNumber)
    .maybeSingle();
  if (error) throw error;
  return (data as SessionWithLogs) ?? null;
}

async function findCycleSessionWithLogs(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  cycleId: string | null,
  weekFocus: WeekFocus,
  dayNumber: number
): Promise<SessionWithLogs | null> {
  if (!cycleId) return null;
  const { data, error } = await supabase
    .from("sessions")
    .select("*, set_logs(*)")
    .eq("user_id", userId)
    .eq("routine_id", routineId)
    .eq("cycle_id", cycleId)
    .eq("week_focus", weekFocus)
    .eq("day_number", dayNumber)
    .order("performed_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SessionWithLogs) ?? null;
}

export async function loadDayWorkout(
  supabase: SupabaseClient,
  routineId: string,
  weekFocus: WeekFocus,
  dayNumber: number,
  sessionId: string | null
): Promise<ExerciseWithTarget[]> {
  const exercisesPromise = loadExercisesWithTargets(
    supabase,
    routineId,
    dayNumber
  );
  const setsPromise = sessionId
    ? supabase
        .from("set_logs")
        .select("*")
        .eq("session_id", sessionId)
        .order("set_number")
    : Promise.resolve({ data: [] as SetLog[] });

  const [exercises, { data: sets }] = await Promise.all([
    exercisesPromise,
    setsPromise,
  ]);

  return stitchExercises(exercises, weekFocus, (sets ?? []) as SetLog[]);
}

/**
 * Load everything the Today page needs with overlapping round trips:
 * routines || latest cycle, then days || last logged session, then
 * (session + its sets) || (exercises + targets).
 */
export async function loadTodayPageData(
  supabase: SupabaseClient,
  userId: string,
  params: {
    explicitDate: string | null;
    requestedOn: string;
    reset: boolean;
    week?: string;
    day?: string;
  }
): Promise<{
  routine: Routine;
  days: RoutineDay[];
  weekFocus: WeekFocus;
  dayNumber: number;
  cycle: Cycle;
  session: Session | null;
  performedOn: string;
  exercises: ExerciseWithTarget[];
}> {
  const [{ active: routine }, existingCycle] = await Promise.all([
    ensureUserRoutines(supabase, userId),
    fetchLatestCycle(supabase, userId),
  ]);

  const [days, last] = await Promise.all([
    getRoutineDays(supabase, routine.id),
    fetchLastLoggedSession(supabase, userId, routine.id),
  ]);

  const maxDay = days.length || 1;
  const defaults = defaultDayFromLast(last, routine, maxDay);
  const mode = routineMode(routine);
  const weekFocus = showsWeekPicker(mode)
    ? parseWeekFocus(params.week) ?? defaults.weekFocus
    : defaults.weekFocus;
  const dayNumber = parseDayNumber(params.day, maxDay) ?? defaults.dayNumber;

  // Every routine gets a cycle, periodized or not, so a completed pass
  // through its days can be told apart from a fresh one (see
  // findCycleSession below). WorkoutSession's "Reset — Start …" button
  // always adds ?reset=1 so a new cycle starts reliably the instant it's
  // tapped — resolveDefaultDay's own wrap detection alone would miss a
  // same-day reset, since its "resume today's in-progress session"
  // short-circuit returns wrappedCycle: false regardless of whether
  // today's session was actually the block's last day.
  const cycle = await continueCycle(supabase, userId, existingCycle, {
    startNext: params.reset || defaults.wrappedCycle,
    startedOn: params.requestedOn,
  });

  const [sessionRow, exerciseRows] = await Promise.all([
    params.explicitDate
      ? findSessionWithLogs(
          supabase,
          userId,
          routine.id,
          weekFocus,
          dayNumber,
          params.explicitDate
        )
      : findCycleSessionWithLogs(
          supabase,
          userId,
          routine.id,
          cycle.id,
          weekFocus,
          dayNumber
        ),
    loadExercisesWithTargets(supabase, routine.id, dayNumber),
  ]);

  const session = sessionRow
    ? (() => {
        const { set_logs, ...rest } = sessionRow;
        void set_logs;
        return rest as Session;
      })()
    : null;
  const performedOn =
    params.explicitDate ?? sessionRow?.performed_on ?? params.requestedOn;

  return {
    routine,
    days,
    weekFocus,
    dayNumber,
    cycle,
    session,
    performedOn,
    exercises: stitchExercises(
      exerciseRows,
      weekFocus,
      sessionRow?.set_logs ?? []
    ),
  };
}

export function parseWeekFocus(value: string | undefined): WeekFocus | null {
  if (!value) return null;
  return WEEK_FOCI.includes(value as WeekFocus)
    ? (value as WeekFocus)
    : null;
}

export function parseDayNumber(
  value: string | undefined,
  maxDay = 7
): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > maxDay) return null;
  return n;
}

export async function loadActiveWorkoutContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ routine: Routine; days: RoutineDay[] }> {
  const { active: routine } = await ensureUserRoutines(supabase, userId);
  const days = await getRoutineDays(supabase, routine.id);
  return { routine, days };
}
