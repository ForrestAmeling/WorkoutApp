import { normalizeExerciseName } from "./exercise-match";

type Named = { id: string; name: string };

/** "Farmer's Walk" and "Farmers Walk" are the same exercise. */
function nameKey(name: string) {
  return normalizeExerciseName(name.replace(/['’]/g, ""));
}

/**
 * Find which existing routine exercise an AI-edited exercise refers to, so
 * an AI edit only changes what was asked and leaves the rest exactly as the
 * user had it (name, library link, photo, muscle group, targets, history).
 * Matches on the normalized name, preferring the same day, then anywhere in
 * the routine (the AI moved it). Each original is claimed at most once, so
 * an exercise repeated on several days maps day-for-day.
 */
export function matchOriginalExercise<T extends Named>(
  name: string,
  sameDay: T[],
  wholeRoutine: T[],
  claimed: Set<string>
): T | null {
  const key = nameKey(name);
  if (!key) return null;
  const hit = (ex: T) => !claimed.has(ex.id) && nameKey(ex.name) === key;
  const found = sameDay.find(hit) ?? wholeRoutine.find(hit) ?? null;
  if (found) claimed.add(found.id);
  return found;
}

/**
 * When the AI swaps an exercise out (the slot's original name no longer
 * appears anywhere on that day), the new exercise in that slot inherits the
 * old one's sets/reps. Returns the replaced original, if any.
 */
export function replacedSlotExercise<T extends Named>(
  slot: T | undefined,
  newDayNames: string[]
): T | undefined {
  if (!slot) return undefined;
  const key = nameKey(slot.name);
  return newDayNames.some((n) => nameKey(n) === key) ? undefined : slot;
}
