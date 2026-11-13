import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Take exercises out of a routine without losing history. set_logs keep a
 * hard reference to their exercise, so one with logged sets can't be
 * deleted — it's archived instead: hidden from the routine editor and
 * Today, detached from its day (so the day itself can still be deleted),
 * while History, Progress and weight suggestions keep seeing its sets.
 * Exercises with nothing logged are deleted outright. Safe to call from
 * the browser or the server.
 */
export async function removeExercises(
  supabase: SupabaseClient,
  exerciseIds: string[]
): Promise<void> {
  if (exerciseIds.length === 0) return;

  const { data, error } = await supabase
    .from("set_logs")
    .select("exercise_id")
    .in("exercise_id", exerciseIds);
  if (error) throw error;
  const logged = new Set((data ?? []).map((r) => r.exercise_id as string));

  const archive = exerciseIds.filter((id) => logged.has(id));
  const remove = exerciseIds.filter((id) => !logged.has(id));

  if (archive.length) {
    const { error: archiveError } = await supabase
      .from("exercises")
      .update({ archived: true, routine_day_id: null })
      .in("id", archive);
    if (archiveError) throw archiveError;
  }
  if (remove.length) {
    const { error: deleteError } = await supabase
      .from("exercises")
      .delete()
      .in("id", remove);
    if (deleteError) throw deleteError;
  }
}
