import type { SupabaseClient } from "@supabase/supabase-js";
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

/** Clone seeded template exercises into the user's first routine if needed. */
export async function ensureUserRoutines(
  supabase: SupabaseClient,
  userId: string
): Promise<Routine> {
  const existing = await listRoutines(supabase, userId);
  if (existing.length > 0) {
    const active = existing.find((r) => r.is_active) ?? existing[0];
    if (!active.is_active) {
      await setActiveRoutine(supabase, userId, active.id);
      return { ...active, is_active: true };
    }
    return active;
  }

  return cloneTemplateRoutine(supabase, userId, "3-Week Periodization");
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

  for (const tmpl of templates) {
    const { data: ex, error: exError } = await supabase
      .from("exercises")
      .insert({
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
      })
      .select("id")
      .single();
    if (exError) throw exError;

    const targets = (tmpl.exercise_targets ?? []).map((t) => ({
      exercise_id: ex.id,
      week_focus: t.week_focus,
      target_sets: t.target_sets,
      rep_low: t.rep_low,
      rep_high: t.rep_high,
    }));
    if (targets.length) {
      const { error: tError } = await supabase
        .from("exercise_targets")
        .insert(targets);
      if (tError) throw tError;
    }
  }

  return routine as Routine;
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

  const foci = fociForMode(mode);

  for (const [i, day] of opts.days.entries()) {
    const { data: dayRow, error: dayError } = await supabase
      .from("routine_days")
      .insert({
        routine_id: routine.id,
        day_number: day.day_number,
        name: day.name,
        sort_order: i + 1,
      })
      .select("*")
      .single();
    if (dayError) throw dayError;

    for (const [j, ex] of day.exercises.entries()) {
      const { data: exRow, error: exError } = await supabase
        .from("exercises")
        .insert({
          name: ex.name,
          muscle_group: ex.muscle_group ?? null,
          day_number: day.day_number,
          is_accessory: ex.is_accessory ?? false,
          sort_order: j + 1,
          routine_id: routine.id,
          routine_day_id: dayRow.id,
          library_id: ex.library_id ?? null,
          image_url: ex.image_url ?? null,
          is_template: false,
        })
        .select("id")
        .single();
      if (exError) throw exError;

      const targetRows = foci.map((focus) => {
        const custom = ex.targets?.[focus];
        const defaults = defaultTargetsForFocus(focus);
        return {
          exercise_id: exRow.id,
          week_focus: focus,
          target_sets: custom?.target_sets ?? ex.target_sets ?? defaults.target_sets,
          rep_low: custom?.rep_low ?? ex.rep_low ?? defaults.rep_low,
          rep_high: custom?.rep_high ?? ex.rep_high ?? defaults.rep_high,
        };
      });

      const { error: tError } = await supabase
        .from("exercise_targets")
        .insert(targetRows);
      if (tError) throw tError;
    }
  }

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
  const routine = await getRoutine(supabase, routineId);
  if (!routine) return null;

  const days = await getRoutineDays(supabase, routineId);
  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("*, exercise_targets(*)")
    .eq("routine_id", routineId)
    .eq("is_template", false)
    .order("sort_order");
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

/** Replace all days/exercises on an existing routine (keeps id + active flag). */
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

  // Cascades remove exercises/targets via routine_days → exercises
  const { error: delError } = await supabase
    .from("routine_days")
    .delete()
    .eq("routine_id", routineId);
  if (delError) throw delError;

  const foci = fociForMode(mode);
  for (const [i, day] of opts.days.entries()) {
    const { data: dayRow, error: dayError } = await supabase
      .from("routine_days")
      .insert({
        routine_id: routineId,
        day_number: day.day_number,
        name: day.name,
        sort_order: i + 1,
      })
      .select("*")
      .single();
    if (dayError) throw dayError;

    for (const [j, ex] of day.exercises.entries()) {
      const { data: exRow, error: exError } = await supabase
        .from("exercises")
        .insert({
          name: ex.name,
          muscle_group: ex.muscle_group ?? null,
          day_number: day.day_number,
          is_accessory: ex.is_accessory ?? false,
          sort_order: j + 1,
          routine_id: routineId,
          routine_day_id: dayRow.id,
          library_id: ex.library_id ?? null,
          image_url: ex.image_url ?? null,
          is_template: false,
        })
        .select("id")
        .single();
      if (exError) throw exError;

      const targetRows = foci.map((focus) => {
        const custom = ex.targets?.[focus];
        const defaults = defaultTargetsForFocus(focus);
        return {
          exercise_id: exRow.id,
          week_focus: focus,
          target_sets:
            custom?.target_sets ?? ex.target_sets ?? defaults.target_sets,
          rep_low: custom?.rep_low ?? ex.rep_low ?? defaults.rep_low,
          rep_high: custom?.rep_high ?? ex.rep_high ?? defaults.rep_high,
        };
      });
      const { error: tError } = await supabase
        .from("exercise_targets")
        .insert(targetRows);
      if (tError) throw tError;
    }
  }

  const loaded = await loadRoutineEditor(supabase, routineId);
  if (!loaded) throw new Error("Failed to reload routine");
  return loaded;
}
