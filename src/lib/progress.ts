import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeekFocus } from "./types";

export type SessionProgressPoint = {
  date: string;
  weekFocus: WeekFocus;
  maxWeight: number;
  avgWeight: number;
  avgReps: number;
  maxReps: number;
  sets: number;
  volume: number;
};

export type ExerciseProgress = {
  key: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  dayNumber: number;
  sortOrder: number;
  points: SessionProgressPoint[];
  startWeight: number | null;
  latestWeight: number | null;
  weightDelta: number | null;
  startReps: number | null;
  latestReps: number | null;
  sessionCount: number;
};

type RawSetRow = {
  weight: number | null;
  reps: number | null;
  set_number: number;
  exercise_id: string;
  sessions:
    | {
        id: string;
        performed_on: string;
        week_focus: WeekFocus;
        routine_id: string | null;
        user_id: string;
      }
    | {
        id: string;
        performed_on: string;
        week_focus: WeekFocus;
        routine_id: string | null;
        user_id: string;
      }[];
  exercises:
    | {
        id: string;
        name: string;
        library_id: string | null;
        muscle_group: string | null;
        day_number: number;
        sort_order: number;
        routine_id: string | null;
      }
    | {
        id: string;
        name: string;
        library_id: string | null;
        muscle_group: string | null;
        day_number: number;
        sort_order: number;
        routine_id: string | null;
      }[];
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function exerciseKey(ex: {
  library_id: string | null;
  name: string;
  id: string;
}) {
  if (ex.library_id) return `lib:${ex.library_id}`;
  return `name:${ex.name.trim().toLowerCase()}`;
}

/**
 * Load per-exercise progress for a routine (or all user sessions if routineId is null).
 * Groups by library_id when present so AI/copy rebuilds still stitch history.
 */
export async function loadExerciseProgress(
  supabase: SupabaseClient,
  userId: string,
  options?: { routineId?: string | null; limitSets?: number }
): Promise<ExerciseProgress[]> {
  const limit = options?.limitSets ?? 2500;
  let query = supabase
    .from("set_logs")
    .select(
      `
      weight,
      reps,
      set_number,
      exercise_id,
      sessions!inner ( id, performed_on, week_focus, routine_id, user_id ),
      exercises!inner ( id, name, library_id, muscle_group, day_number, sort_order, routine_id )
    `
    )
    .eq("sessions.user_id", userId)
    .not("weight", "is", null)
    .not("reps", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (options?.routineId) {
    query = query.eq("sessions.routine_id", options.routineId);
  }

  const { data, error } = await query;
  if (error) throw error;

  type BucketSet = { weight: number; reps: number };
  type Bucket = {
    key: string;
    exerciseId: string;
    name: string;
    muscleGroup: string | null;
    dayNumber: number;
    sortOrder: number;
    sessions: Map<
      string,
      { date: string; weekFocus: WeekFocus; sets: BucketSet[] }
    >;
  };

  const byExercise = new Map<string, Bucket>();

  for (const raw of (data ?? []) as RawSetRow[]) {
    const session = one(raw.sessions);
    const exercise = one(raw.exercises);
    if (!session || !exercise) continue;
    if (raw.weight == null || raw.reps == null) continue;

    const key = exerciseKey(exercise);
    let bucket = byExercise.get(key);
    if (!bucket) {
      bucket = {
        key,
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        dayNumber: exercise.day_number,
        sortOrder: exercise.sort_order,
        sessions: new Map(),
      };
      byExercise.set(key, bucket);
    } else {
      // Prefer latest exercise row metadata
      bucket.exerciseId = exercise.id;
      bucket.name = exercise.name;
      bucket.muscleGroup = exercise.muscle_group;
      bucket.dayNumber = exercise.day_number;
      bucket.sortOrder = exercise.sort_order;
    }

    const sessionKey = `${session.id}`;
    let sess = bucket.sessions.get(sessionKey);
    if (!sess) {
      sess = {
        date: session.performed_on,
        weekFocus: session.week_focus,
        sets: [],
      };
      bucket.sessions.set(sessionKey, sess);
    }
    sess.sets.push({ weight: Number(raw.weight), reps: Number(raw.reps) });
  }

  const results: ExerciseProgress[] = [];

  for (const bucket of byExercise.values()) {
    const points: SessionProgressPoint[] = [...bucket.sessions.values()]
      .map((s) => {
        const weights = s.sets.map((x) => x.weight);
        const reps = s.sets.map((x) => x.reps);
        const maxWeight = Math.max(...weights);
        const avgWeight =
          weights.reduce((a, b) => a + b, 0) / Math.max(1, weights.length);
        const avgReps =
          reps.reduce((a, b) => a + b, 0) / Math.max(1, reps.length);
        const maxReps = Math.max(...reps);
        const volume = s.sets.reduce((a, x) => a + x.weight * x.reps, 0);
        return {
          date: s.date,
          weekFocus: s.weekFocus,
          maxWeight: round1(maxWeight),
          avgWeight: round1(avgWeight),
          avgReps: round1(avgReps),
          maxReps,
          sets: s.sets.length,
          volume: round1(volume),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (points.length === 0) continue;

    const startWeight = points[0].maxWeight;
    const latestWeight = points[points.length - 1].maxWeight;
    const startReps = points[0].avgReps;
    const latestReps = points[points.length - 1].avgReps;

    results.push({
      key: bucket.key,
      exerciseId: bucket.exerciseId,
      name: bucket.name,
      muscleGroup: bucket.muscleGroup,
      dayNumber: bucket.dayNumber,
      sortOrder: bucket.sortOrder,
      points,
      startWeight,
      latestWeight,
      weightDelta: round1(latestWeight - startWeight),
      startReps,
      latestReps,
      sessionCount: points.length,
    });
  }

  return results.sort((a, b) => {
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function filterPointsByFocus(
  points: SessionProgressPoint[],
  focus: WeekFocus | "all"
) {
  if (focus === "all") return points;
  return points.filter((p) => p.weekFocus === focus);
}
