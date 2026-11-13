import type { CustomExercise } from "./custom-exercises";

/**
 * Sending approved user exercises upstream to free-exercise-db as pull
 * requests. Pure helpers live here (file formats, batching rules); the
 * GitHub calls are in github-pr.ts and the schedule in
 * /api/cron/publish-exercises.
 */
export const FREE_DB_REPO = "yuhonas/free-exercise-db";
/** Open a PR as soon as this many approved exercises are waiting… */
export const PUBLISH_BATCH_SIZE = 10;
/** …or once this long has passed since the last one (or the oldest approval). */
export const PUBLISH_INTERVAL_DAYS = 14;

const DAY_MS = 86_400_000;

/** free-exercise-db ids: "3/4 Sit-Up" → "3_4_Sit-Up", "Farmer's Walk" → "Farmers_Walk". */
export function freeDbId(name: string): string {
  return name
    .trim()
    .replace(/['’]/g, "")
    .replace(/[\s/]+/g, "_")
    .replace(/[^0-9A-Za-z_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type FreeDbExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string | null;
  images: string[];
};

/** Same key order as the newest upstream files (id first). Photos become exercises/<id>/<n>.jpg. */
export function toFreeDbExercise(ex: CustomExercise, id: string): FreeDbExercise {
  return {
    id,
    name: ex.name,
    force: ex.force,
    level: ex.level,
    mechanic: ex.mechanic,
    equipment: ex.equipment,
    primaryMuscles: ex.primary_muscles,
    secondaryMuscles: ex.secondary_muscles,
    instructions: ex.instructions,
    category: ex.category,
    images: ex.images.map((_, i) => `${id}/${i}.jpg`),
  };
}

/** An exercise file exactly as upstream formats them. */
export function exerciseFileText(entry: FreeDbExercise) {
  return JSON.stringify(entry, null, 2) + "\n";
}

/**
 * Add entries to dist/exercises.json where `make dist/exercises.json`
 * (jq over the sorted exercise files) would place them. Upstream's file is
 * byte-for-byte JSON.stringify(list, null, 2), so the PR diff is only the
 * new entries.
 */
export function addToDist(distText: string, entries: FreeDbExercise[]): string {
  const list = JSON.parse(distText) as { id: string }[];
  for (const entry of entries) {
    const file = `${entry.id}.json`;
    const at = list.findIndex((e) => `${e.id}.json` > file);
    list.splice(at === -1 ? list.length : at, 0, entry);
  }
  return JSON.stringify(list, null, 2) + "\n";
}

/** When the next PR goes out on time alone (ignoring the batch-size trigger). */
export function nextPublishDue(opts: {
  lastPrAt: string | null;
  oldestApprovedAt: string | null;
}): Date | null {
  const since = opts.lastPrAt ?? opts.oldestApprovedAt;
  return since ? new Date(Date.parse(since) + PUBLISH_INTERVAL_DAYS * DAY_MS) : null;
}

export function shouldOpenPr(opts: {
  waiting: number;
  lastPrAt: string | null;
  oldestApprovedAt: string | null;
  now?: Date;
}): boolean {
  if (opts.waiting >= PUBLISH_BATCH_SIZE) return true;
  if (opts.waiting === 0) return false;
  const due = nextPublishDue(opts);
  return !due || (opts.now ?? new Date()).getTime() >= due.getTime();
}

export function prTitle(entries: FreeDbExercise[]) {
  return entries.length === 1
    ? `feat: add ${entries[0].name} exercise`
    : `feat: add ${entries.length} community exercises`;
}

export function prBody(entries: FreeDbExercise[]) {
  const list = entries
    .map((e) => {
      const photos = e.images.length
        ? `${e.images.length} photo${e.images.length === 1 ? "" : "s"}`
        : "no photos";
      return `- ${e.name}${e.equipment ? ` (${e.equipment})` : ""} — ${photos}`;
    })
    .join("\n");
  return `Adds ${entries.length} exercise${entries.length === 1 ? "" : "s"} contributed by users of [Reps](https://repsapp.fit), a workout tracker built on this dataset.

${list}

Each exercise was written by the person who created it, who agreed to release its text and photos into the public domain under this repository's license, and was reviewed before being sent. Files follow \`schema.json\`; \`dist/exercises.json\` only gains the new entries.`;
}
