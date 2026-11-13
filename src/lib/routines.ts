import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { removeExercises } from "./exercise-removal";
import {
  defaultTargetsForFocus,
  fociForMode,
  parsePeriodizationMode,
  usesPeriodization,
  type PeriodizationMode,
} from "./periodization";
import type {
  Exercise,
  ExerciseTarget,
  Routine,
  RoutineDay,
  RoutineDayInput,
  RoutineExerciseInput,
  RoutineSource,
  WeekFocus,
} from "./types";

type TemplateExercise = Exercise & {
  exercise_targets: ExerciseTarget[];
};

export async function listRoutines(
  supabase: SupabaseClient,
  userId: string
): Promise<Routine[]> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Routine[];
}

export async function getRoutine(
  supabase: SupabaseClient,
  routineId: string
): Promise<Routine | null> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .eq("id", routineId)
    .maybeSingle();
  if (error) throw error;
  return data as Routine | null;
}

export async function getActiveRoutine(
  supabase: SupabaseClient,
  userId: string
): Promise<Routine | null> {
  const { data, error } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data as Routine | null;
}

export async function setActiveRoutine(
  supabase: SupabaseClient,
  userId: string,
  routineId: string
) {
  await supabase
    .from("routines")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .neq("id", routineId);

  const { error } = await supabase
    .from("routines")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", routineId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function getRoutineDays(
  supabase: SupabaseClient,
  routineId: string
): Promise<RoutineDay[]> {
  const { data, error } = await supabase
    .from("routine_days")
    .select("*")
    .eq("routine_id", routineId)
    .order("sort_order")
    .order("day_number");
  if (error) throw error;
  return (data ?? []) as RoutineDay[];
}

/**
 * Clone seeded template exercises into the user's first routine if needed.
 * Returns the full routine list alongside the active one — callers that
 * also need the list (Routines/Progress pages) can reuse it instead of
 * immediately re-running the exact same query this function already did.
 */
export async function ensureUserRoutines(
  supabase: SupabaseClient,
  userId: string
): Promise<{ active: Routine; routines: Routine[] }> {
  const existing = await listRoutines(supabase, userId);
  if (existing.length > 0) {
    const active = existing.find((r) => r.is_active) ?? existing[0];
    if (!active.is_active) {
      await setActiveRoutine(supabase, userId, active.id);
      // setActiveRoutine also clears is_active on every other routine —
      // re-fetch rather than guess at their new state from the stale list.
      const refreshed = await listRoutines(supabase, userId);
      // Under a race (e.g. this exact routine got deleted or reassigned
      // by a concurrent request between setActiveRoutine and this
      // re-fetch), fall back to whatever the refreshed list itself says
      // is active rather than a synthetic object that might not actually
      // be a member of `routines` — callers rely on `active` being
      // findable inside `routines` (e.g. to highlight it in a picker).
      const stillActive =
        refreshed.find((r) => r.id === active.id) ??
        refreshed.find((r) => r.is_active) ??
        refreshed[0] ??
        { ...active, is_active: true };
      return { active: stillActive, routines: refreshed };
    }
    return { active, routines: existing };
  }

  const cloned = await cloneTemplateRoutine(
    supabase,
    userId,
    "3-Week Periodization"
  );
  return { active: cloned, routines: [cloned] };
}

async function fetchTemplates(
  supabase: SupabaseClient
): Promise<TemplateExercise[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("*, exercise_targets(*)")
    .eq("is_template", true)
    .order("day_number")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as TemplateExercise[];
}

export async function cloneTemplateRoutine(
  supabase: SupabaseClient,
  userId: string,
  name: string
): Promise<Routine> {
  const templates = await fetchTemplates(supabase);
  if (templates.length === 0) {
    throw new Error("No template exercises found to clone");
  }

  const dayNumbers = [...new Set(templates.map((t) => t.day_number))].sort(
    (a, b) => a - b
  );

  const { data: routine, error: routineError } = await supabase
    .from("routines")
    .insert({
      user_id: userId,
      name,
      description: "Your original light / middle / heavy 5-day program",
      uses_periodization: true,
      periodization_mode: "full" satisfies PeriodizationMode,
      is_active: true,
      source: "seed" satisfies RoutineSource,
    })
    .select("*")
    .single();
  if (routineError) throw routineError;

  const dayRows = dayNumbers.map((n, i) => ({
    routine_id: routine.id,
    day_number: n,
    name: `Day ${n}`,
    sort_order: i + 1,
  }));

  const { data: days, error: daysError } = await supabase
    .from("routine_days")
    .insert(dayRows)
    .select("*");
  if (daysError) throw daysError;

  const dayIdByNumber = new Map(
    (days as RoutineDay[]).map((d) => [d.day_number, d.id])
  );

  // Batch both inserts (one round trip each) instead of one exercise +
  // one exercise_targets call per template row. Pre-generating each
  // exercise's id up front lets the exercise_targets rows reference it
  // immediately, without needing to correlate against whatever order a
  // multi-row INSERT...RETURNING happens to come back in.
  const exerciseIds = templates.map(() => randomUUID());
  const exerciseRows = templates.map((tmpl, i) => ({
    id: exerciseIds[i],
    name: tmpl.name,
    muscle_group: tmpl.muscle_group,
    day_number: tmpl.day_number,
    is_accessory: tmpl.is_accessory,
    sort_order: tmpl.sort_order,
    routine_id: routine.id,
    routine_day_id: dayIdByNumber.get(tmpl.day_number)!,
    library_id: null,
    image_url: null,
    is_template: false,
  }));
  const { error: exError } = await supabase
    .from("exercises")
    .insert(exerciseRows);
  if (exError) throw exError;

  const targetRows = templates.flatMap((tmpl, i) =>
    (tmpl.exercise_targets ?? []).map((t) => ({
      exercise_id: exerciseIds[i],
      week_focus: t.week_focus,
      target_sets: t.target_sets,
      rep_low: t.rep_low,
      rep_high: t.rep_high,
    }))
  );
  if (targetRows.length) {
    const { error: tError } = await supabase
      .from("exercise_targets")
      .insert(targetRows);
    if (tError) throw tError;
  }

  return routine as Routine;
}

/** One exercise_targets row per week focus, from the input's per-focus
 * targets, then its flat targets, then the focus defaults. */
function targetRowsFor(
  exerciseId: string,
  ex: RoutineExerciseInput,
  foci: WeekFocus[]
) {
  return foci.map((focus) => {
    const custom = ex.targets?.[focus];
    const defaults = defaultTargetsForFocus(focus);
    return {
      exercise_id: exerciseId,
      week_focus: focus,
      target_sets: custom?.target_sets ?? ex.target_sets ?? defaults.target_sets,
      rep_low: custom?.rep_low ?? ex.rep_low ?? defaults.rep_low,
      rep_high: custom?.rep_high ?? ex.rep_high ?? defaults.rep_high,
    };
  });
}

/**
 * Batch-insert a routine's days, then its exercises, then its
 * exercise_targets — one round trip per level instead of one row at a time
 * per day/exercise. Each day/exercise gets a client-generated id up front
 * so the next level's rows can reference it immediately, without needing
 * to correlate against whatever order a multi-row INSERT...RETURNING
 * happens to come back in. Shared by createRoutineFromDays and
 * replaceRoutineContent, which both populate a routine's content the same
 * way.
 */
async function insertRoutineDays(
  supabase: SupabaseClient,
  routineId: string,
  days: RoutineDayInput[],
  foci: WeekFocus[]
): Promise<void> {
  const plannedDays = days.map((day, i) => ({
    id: randomUUID(),
    day,
    sortOrder: i + 1,
  }));
  const dayRows = plannedDays.map((pd) => ({
    id: pd.id,
    routine_id: routineId,
    day_number: pd.day.day_number,
    name: pd.day.name,
    sort_order: pd.sortOrder,
  }));
  const { error: daysError } = await supabase
    .from("routine_days")
    .insert(dayRows);
  if (daysError) throw daysError;

  const plannedExercises = plannedDays.flatMap((pd) =>
    pd.day.exercises.map((ex, j) => ({
      id: randomUUID(),
      dayId: pd.id,
      dayNumber: pd.day.day_number,
      sortOrder: j + 1,
      ex,
    }))
  );
  if (plannedExercises.length === 0) return;

  const exerciseRows = plannedExercises.map((p) => ({
    id: p.id,
    name: p.ex.name,
    muscle_group: p.ex.muscle_group ?? null,
    day_number: p.dayNumber,
    is_accessory: p.ex.is_accessory ?? false,
    sort_order: p.sortOrder,
    routine_id: routineId,
    routine_day_id: p.dayId,
    library_id: p.ex.library_id ?? null,
    image_url: p.ex.image_url ?? null,
    is_template: false,
  }));
  const { error: exError } = await supabase
    .from("exercises")
    .insert(exerciseRows);
  if (exError) throw exError;

  const targetRows = plannedExercises.flatMap((p) =>
    targetRowsFor(p.id, p.ex, foci)
  );
  if (targetRows.length === 0) return;
  const { error: tError } = await supabase
    .from("exercise_targets")
    .insert(targetRows);
  if (tError) throw tError;
}

export async function createRoutineFromDays(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    name: string;
    description?: string;
    source: RoutineSource;
    periodization_mode?: PeriodizationMode;
    uses_periodization?: boolean;
    makeActive?: boolean;
    days: RoutineDayInput[];
  }
): Promise<Routine> {
  const mode =
    parsePeriodizationMode(opts.periodization_mode) ??
    (opts.uses_periodization ? "full" : "none");

  if (opts.makeActive !== false) {
    await supabase
      .from("routines")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  }

  const { data: routine, error } = await supabase
    .from("routines")
    .insert({
      user_id: userId,
      name: opts.name,
      description: opts.description ?? null,
      uses_periodization: usesPeriodization(mode),
      periodization_mode: mode,
      is_active: opts.makeActive !== false,
      source: opts.source,
    })
    .select("*")
    .single();
  if (error) throw error;

  await insertRoutineDays(supabase, routine.id, opts.days, fociForMode(mode));

  return routine as Routine;
}

export async function renameRoutine(
  supabase: SupabaseClient,
  routineId: string,
  name: string
) {
  const { error } = await supabase
    .from("routines")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", routineId);
  if (error) throw error;
}

export async function deleteRoutine(
  supabase: SupabaseClient,
  userId: string,
  routineId: string
) {
  const routines = await listRoutines(supabase, userId);
  if (routines.length <= 1) {
    throw new Error("Keep at least one routine");
  }
  const dying = routines.find((r) => r.id === routineId);
  const { error } = await supabase
    .from("routines")
    .delete()
    .eq("id", routineId)
    .eq("user_id", userId);
  if (error) throw error;

  if (dying?.is_active) {
    const next = routines.find((r) => r.id !== routineId);
    if (next) await setActiveRoutine(supabase, userId, next.id);
  }
}

export type EditorExercise = Exercise & {
  targets: ExerciseTarget[];
};

export type EditorDay = RoutineDay & {
  exercises: EditorExercise[];
};

export async function loadRoutineEditor(
  supabase: SupabaseClient,
  routineId: string
): Promise<{ routine: Routine; days: EditorDay[] } | null> {
  // getRoutine, getRoutineDays, and the exercises query are all independent
  // reads keyed only on routineId — run them concurrently instead of
  // waiting for the (rare) not-found check before starting the other two.
  const [routine, days, { data: exercises, error }] = await Promise.all([
    getRoutine(supabase, routineId),
    getRoutineDays(supabase, routineId),
    supabase
      .from("exercises")
      .select("*, exercise_targets(*)")
      .eq("routine_id", routineId)
      .eq("is_template", false)
      .eq("archived", false)
      .order("sort_order"),
  ]);
  if (!routine) return null;
  if (error) throw error;

  const byDay = new Map<string, EditorExercise[]>();
  for (const row of exercises ?? []) {
    const { exercise_targets, ...ex } = row as Exercise & {
      exercise_targets: ExerciseTarget[];
    };
    const list = byDay.get(ex.routine_day_id!) ?? [];
    list.push({ ...ex, targets: exercise_targets ?? [] });
    byDay.set(ex.routine_day_id!, list);
  }

  return {
    routine,
    days: days.map((d) => ({
      ...d,
      exercises: byDay.get(d.id) ?? [],
    })),
  };
}

function editorDaysToInput(days: EditorDay[]): RoutineDayInput[] {
  return days.map((d) => ({
    day_number: d.day_number,
    name: d.name,
    exercises: d.exercises.map((ex) => {
      const targets: RoutineDayInput["exercises"][number]["targets"] = {};
      for (const t of ex.targets) {
        targets[t.week_focus] = {
          target_sets: t.target_sets,
          rep_low: t.rep_low,
          rep_high: t.rep_high,
        };
      }
      const primary =
        ex.targets.find((t) => t.week_focus === "middle") ?? ex.targets[0];
      return {
        name: ex.name,
        library_id: ex.library_id,
        image_url: ex.image_url,
        muscle_group: ex.muscle_group,
        is_accessory: ex.is_accessory,
        target_sets: primary?.target_sets ?? 3,
        rep_low: primary?.rep_low ?? 8,
        rep_high: primary?.rep_high ?? 12,
        targets,
      };
    }),
  }));
}

/** Duplicate a routine (inactive). Returns the new routine. */
export async function copyRoutine(
  supabase: SupabaseClient,
  userId: string,
  routineId: string
): Promise<Routine> {
  const loaded = await loadRoutineEditor(supabase, routineId);
  if (!loaded || loaded.routine.user_id !== userId) {
    throw new Error("Routine not found");
  }

  const mode =
    parsePeriodizationMode(loaded.routine.periodization_mode) ??
    (loaded.routine.uses_periodization ? "full" : "none");

  const baseName = loaded.routine.name.replace(/\s*\(Copy(?:\s*\d+)?\)\s*$/i, "");
  const existing = await listRoutines(supabase, userId);
  let name = `${baseName} (Copy)`;
  let n = 2;
  while (existing.some((r) => r.name === name)) {
    name = `${baseName} (Copy ${n})`;
    n += 1;
  }

  return createRoutineFromDays(supabase, userId, {
    name,
    description: loaded.routine.description ?? undefined,
    source: "manual",
    periodization_mode: mode,
    makeActive: false,
    days: editorDaysToInput(loaded.days),
  });
}

/**
 * Apply edited days/exercises to an existing routine in place (keeps id +
 * active flag). Exercises that carry their existing `id` are updated where
 * they are, so they keep their logged history; exercises the edit left out
 * go through removeExercises (archived when they have history). Days are
 * reused by position.
 */
export async function replaceRoutineContent(
  supabase: SupabaseClient,
  userId: string,
  routineId: string,
  opts: {
    name?: string;
    description?: string | null;
    periodization_mode?: PeriodizationMode;
    days: RoutineDayInput[];
  }
): Promise<{ routine: Routine; days: EditorDay[] }> {
  const existing = await getRoutine(supabase, routineId);
  if (!existing || existing.user_id !== userId) {
    throw new Error("Routine not found");
  }

  const mode =
    parsePeriodizationMode(opts.periodization_mode) ??
    parsePeriodizationMode(existing.periodization_mode) ??
    (existing.uses_periodization ? "full" : "none");

  const { error: updError } = await supabase
    .from("routines")
    .update({
      name: opts.name?.trim() || existing.name,
      description:
        opts.description !== undefined
          ? opts.description
          : existing.description,
      uses_periodization: usesPeriodization(mode),
      periodization_mode: mode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", routineId)
    .eq("user_id", userId);
  if (updError) throw updError;

  const current = await loadRoutineEditor(supabase, routineId);
  if (!current) throw new Error("Routine not found");
  const foci = fociForMode(mode);

  const currentIds = new Set(
    current.days.flatMap((d) => d.exercises.map((e) => e.id))
  );
  const keptIds = new Set<string>();
  const plannedDays = opts.days.map((day, i) => ({
    id: current.days[i]?.id ?? randomUUID(),
    existing: Boolean(current.days[i]),
    day,
    sortOrder: i + 1,
  }));
  const plannedExercises = plannedDays.flatMap((pd) =>
    pd.day.exercises.map((ex, j) => {
      const keep = ex.id && currentIds.has(ex.id) && !keptIds.has(ex.id);
      if (keep) keptIds.add(ex.id!);
      return {
        id: keep ? ex.id! : randomUUID(),
        dayId: pd.id,
        dayNumber: pd.day.day_number,
        sortOrder: j + 1,
        ex,
      };
    })
  );

  // Exercises the edit dropped: deleted, or archived if they have history.
  await removeExercises(
    supabase,
    [...currentIds].filter((id) => !keptIds.has(id))
  );

  // Reused days are renumbered in ascending order so the (routine_id,
  // day_number) unique index never sees two days on one number mid-way.
  for (const pd of plannedDays.filter((p) => p.existing)) {
    const { error } = await supabase
      .from("routine_days")
      .update({
        day_number: pd.day.day_number,
        name: pd.day.name,
        sort_order: pd.sortOrder,
      })
      .eq("id", pd.id);
    if (error) throw error;
  }
  const addedDays = plannedDays.filter((p) => !p.existing);
  if (addedDays.length) {
    const { error } = await supabase.from("routine_days").insert(
      addedDays.map((pd) => ({
        id: pd.id,
        routine_id: routineId,
        day_number: pd.day.day_number,
        name: pd.day.name,
        sort_order: pd.sortOrder,
      }))
    );
    if (error) throw error;
  }

  // Kept exercises update in place, new ones insert — one upsert.
  if (plannedExercises.length) {
    const { error: exError } = await supabase.from("exercises").upsert(
      plannedExercises.map((p) => ({
        id: p.id,
        name: p.ex.name,
        muscle_group: p.ex.muscle_group ?? null,
        day_number: p.dayNumber,
        is_accessory: p.ex.is_accessory ?? false,
        sort_order: p.sortOrder,
        routine_id: routineId,
        routine_day_id: p.dayId,
        library_id: p.ex.library_id ?? null,
        image_url: p.ex.image_url ?? null,
        is_template: false,
      }))
    );
    if (exError) throw exError;
  }

  if (keptIds.size) {
    const { error } = await supabase
      .from("exercise_targets")
      .delete()
      .in("exercise_id", [...keptIds]);
    if (error) throw error;
  }
  const targetRows = plannedExercises.flatMap((p) =>
    targetRowsFor(p.id, p.ex, foci)
  );
  if (targetRows.length) {
    const { error } = await supabase.from("exercise_targets").insert(targetRows);
    if (error) throw error;
  }

  // Days past the new end — their exercises were moved or removed above.
  const removedDayIds = current.days.slice(plannedDays.length).map((d) => d.id);
  if (removedDayIds.length) {
    const { error } = await supabase
      .from("routine_days")
      .delete()
      .in("id", removedDayIds);
    if (error) throw error;
  }

  const loaded = await loadRoutineEditor(supabase, routineId);
  if (!loaded) throw new Error("Failed to reload routine");
  return loaded;
}
