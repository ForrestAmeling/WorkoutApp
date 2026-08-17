import type { SetLog } from "./types";

const QUEUE_KEY = "reps-offline-sets";

export type QueuedSet = {
  id: string;
  session: {
    routineId: string;
    weekFocus: string;
    dayNumber: number;
    cycleId: string | null;
    performedOn: string;
  };
  log: {
    exercise_id: string;
    set_number: number;
    weight: number | null;
    reps: number;
    ai_suggested_weight: number | null;
    notes: string | null;
  };
  createdAt: string;
};

export function loadQueue(): QueuedSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedSet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: QueuedSet[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueueSet(item: Omit<QueuedSet, "id" | "createdAt">): QueuedSet {
  const queued: QueuedSet = {
    ...item,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  saveQueue([...loadQueue(), queued]);
  return queued;
}

export function queuedToSetLog(item: QueuedSet, exerciseId: string): SetLog {
  return {
    id: item.id,
    session_id: "pending",
    exercise_id: exerciseId,
    set_number: item.log.set_number,
    weight: item.log.weight,
    reps: item.log.reps,
    ai_suggested_weight: item.log.ai_suggested_weight,
    notes: item.log.notes,
    created_at: item.createdAt,
  };
}

export function isNetworkError(err: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  // fetch() is spec-guaranteed to reject with a TypeError on any network
  // failure, regardless of the browser-specific message text (Chrome says
  // "Failed to fetch", Firefox "NetworkError when attempting to fetch
  // resource", Safari/WebKit just "Load failed" — which matched none of the
  // substrings below, so on iOS a normal connectivity blip was misclassified
  // as a non-network error and the set was dropped instead of queued).
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|network|offline|fetch|load failed/i.test(msg);
}
