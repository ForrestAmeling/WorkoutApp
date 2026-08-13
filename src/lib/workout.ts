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
  ExerciseWithTarget,
  Routine,
  RoutineDay,
  Session,
  SetLog,
  WeekFocus,
} from "./types";

export function routineMode(routine: Routine): PeriodizationMode {
  return (
    parsePeriodizationMode(routine.periodization_mode) ??
    (routine.uses_periodization ? "full" : "none")
  );
}

export async function ensureCycle(
  supabase: SupabaseClient,
  userId: string,
  opts?: { startNext?: boolean; startedOn?: string }
): Promise<Cycle> {
  const startedOn = opts?.startedOn ?? todayISO();
  const { data: existing } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .order("cycle_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !opts?.startNext) return existing as Cycle;

  if (existing && opts?.startNext) {
    if (existing.started_on >= startedOn) return existing as Cycle;
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
  // Only advance from sessions that actually have logged sets
  const { data: last } = await supabase
    .from("sessions")
    .select("week_focus, day_number, set_logs!inner(id)")
    .eq("user_id", userId)
    .eq("routine_id", routine.id)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const mode = routineMode(routine);

  if (!last) {
    return {
      weekFocus: defaultWeekFocus(mode),
      dayNumber: 1,
      wrappedCycle: false,
    };
  }

  if (!showsWeekPicker(mode)) {
    const nextDay =
      last.day_number >= maxDay ? 1 : last.day_number + 1;
    return {
      weekFocus: defaultWeekFocus(mode),
      dayNumber: nextDay,
      wrappedCycle: last.day_number >= maxDay,
    };
  }

  const next = nextPosition(
    last.week_focus as WeekFocus,
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

export async function loadDayWorkout(
  supabase: SupabaseClient,
  routineId: string,
  weekFocus: WeekFocus,
  dayNumber: number,
  sessionId: string | null
): Promise<ExerciseWithTarget[]> {
  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("routine_id", routineId)
    .eq("day_number", dayNumber)
    .eq("is_template", false)
    .order("sort_order");

  if (error) throw error;

  const ids = (exercises ?? []).map((e) => e.id);
  if (ids.length === 0) return [];

  const targetsPromise = supabase
    .from("exercise_targets")
    .select("*")
    .in("exercise_id", ids)
    .eq("week_focus", weekFocus);

  const setsPromise = sessionId
    ? supabase
        .from("set_logs")
        .select("*")
        .eq("session_id", sessionId)
        .in("exercise_id", ids)
        .order("set_number")
    : Promise.resolve({ data: [] as SetLog[] });

  const [{ data: targets }, { data: sets }] = await Promise.all([
    targetsPromise,
    setsPromise,
  ]);

  // Fallback to middle if periodization target missing
  let targetRows = targets ?? [];
  if (targetRows.length === 0 && weekFocus !== "middle") {
    const { data: middle } = await supabase
      .from("exercise_targets")
      .select("*")
      .in("exercise_id", ids)
      .eq("week_focus", "middle");
    targetRows = middle ?? [];
  }

  const targetByEx = new Map(targetRows.map((t) => [t.exercise_id, t]));
  const setsByEx = new Map<string, SetLog[]>();
  for (const s of (sets ?? []) as SetLog[]) {
    const list = setsByEx.get(s.exercise_id) ?? [];
    list.push(s);
    setsByEx.set(s.exercise_id, list);
  }

  return (exercises ?? [])
    .map((ex) => {
      const target = targetByEx.get(ex.id);
      if (!target) return null;
      return {
        ...ex,
        target,
        sets: setsByEx.get(ex.id) ?? [],
      } as ExerciseWithTarget;
    })
    .filter(Boolean) as ExerciseWithTarget[];
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
  const routine = await ensureUserRoutines(supabase, userId);
  const days = await getRoutineDays(supabase, routine.id);
  return { routine, days };
}
