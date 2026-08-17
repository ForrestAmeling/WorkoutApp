import type { SetLog } from "./types";

/**
 * Fired on `window` once a set that was saved to the local offline queue
 * (see offline-queue.ts) has been confirmed synced to Supabase by
 * OfflineSync's flushQueue(). ExerciseCard listens for this to swap the
 * temporary "local-…" id in its state for the real row, so edit/delete
 * (blocked while a set is still "local-…") stop being blocked once the set
 * has actually synced, instead of only clearing on a full page reload.
 */
export const SET_SYNCED_EVENT = "reps:set-synced";

export type SetSyncedDetail = {
  /** The temporary "local-…" id the set was queued under while offline. */
  localId: string;
  /** The real row now persisted in Supabase. */
  row: SetLog;
};
