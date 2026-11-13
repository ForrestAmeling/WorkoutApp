import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXERCISE_IMAGE_BUCKET,
  publishProblems,
  type CustomExercise,
} from "./custom-exercises";
import { loadExerciseLibrary } from "./exercise-library";
import {
  addToDist,
  exerciseFileText,
  freeDbId,
  PUBLISH_BATCH_SIZE,
  prBody,
  prTitle,
  shouldOpenPr,
  toFreeDbExercise,
  type FreeDbExercise,
} from "./exercise-publishing";
import { freeDbPrState, openFreeDbPr, type GitFile } from "./github-pr";
import { localISODate } from "./program";

/**
 * The scheduled side of free-exercise-db publishing, run with the service
 * role (it reads every user's approved exercises and their photos).
 */

/** Move submitted exercises to merged/closed once upstream decides. */
export async function syncSubmissions(admin: SupabaseClient, token: string) {
  const { data, error } = await admin
    .from("exercise_submissions")
    .select("id, pr_number")
    .eq("status", "open")
    .not("pr_number", "is", null);
  if (error) throw error;

  const changed: { pr: number; status: string }[] = [];
  for (const sub of data ?? []) {
    const state = await freeDbPrState(token, sub.pr_number as number);
    if (state === "open") continue;
    const now = new Date().toISOString();
    const { error: subError } = await admin
      .from("exercise_submissions")
      .update({ status: state, updated_at: now })
      .eq("id", sub.id);
    if (subError) throw subError;
    const { error: exError } = await admin
      .from("custom_exercises")
      .update({ publish_status: state, updated_at: now })
      .eq("submission_id", sub.id)
      .eq("publish_status", "submitted");
    if (exError) throw exError;
    changed.push({ pr: sub.pr_number as number, status: state });
  }
  return changed;
}

async function photoFiles(
  admin: SupabaseClient,
  ex: CustomExercise,
  entry: FreeDbExercise
): Promise<GitFile[]> {
  return Promise.all(
    ex.images.map(async (path, i) => {
      const { data, error } = await admin.storage.from(EXERCISE_IMAGE_BUCKET).download(path);
      if (error || !data) throw new Error(`Couldn't read photo ${path}: ${error?.message ?? "missing"}`);
      return {
        path: `exercises/${entry.images[i]}`,
        content: Buffer.from(await data.arrayBuffer()).toString("base64"),
        encoding: "base64" as const,
      };
    })
  );
}

/**
 * Open one PR with up to PUBLISH_BATCH_SIZE approved exercises when a full
 * batch is waiting or the two-week interval has passed. Exercises that
 * can't go (name already in free-exercise-db, missing required fields) are
 * declined with a note instead of holding up the batch.
 */
export async function publishApproved(admin: SupabaseClient, token: string) {
  const [{ data: approved, error }, { data: last, error: lastError }] = await Promise.all([
    admin
      .from("custom_exercises")
      .select("*")
      .eq("publish_status", "approved")
      .order("publish_reviewed_at", { ascending: true }),
    admin
      .from("exercise_submissions")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (lastError) throw lastError;

  const waiting = (approved ?? []) as CustomExercise[];
  if (
    !shouldOpenPr({
      waiting: waiting.length,
      lastPrAt: (last?.created_at as string | undefined) ?? null,
      oldestApprovedAt: waiting[0]?.publish_reviewed_at ?? null,
    })
  ) {
    return { waiting: waiting.length, sent: 0 };
  }

  const taken = new Set((await loadExerciseLibrary()).map((e) => e.id.toLowerCase()));
  const batch: { ex: CustomExercise; entry: FreeDbExercise }[] = [];
  for (const ex of waiting) {
    if (batch.length >= PUBLISH_BATCH_SIZE) break;
    const id = freeDbId(ex.name);
    const missing = publishProblems(ex);
    const note = missing.length
      ? `free-exercise-db needs ${missing.join(", ")}.`
      : !id || taken.has(id.toLowerCase())
        ? "free-exercise-db already has an exercise with this name — rename it and submit again."
        : null;
    if (note) {
      await admin
        .from("custom_exercises")
        .update({ publish_status: "rejected", publish_note: note })
        .eq("id", ex.id)
        .eq("publish_status", "approved");
      continue;
    }
    taken.add(id.toLowerCase());
    batch.push({ ex, entry: toFreeDbExercise(ex, id) });
  }
  if (batch.length === 0) return { waiting: waiting.length, sent: 0 };

  const entries = batch.map((b) => b.entry);
  const files: GitFile[] = [
    ...entries.map((entry) => ({
      path: `exercises/${entry.id}.json`,
      content: exerciseFileText(entry),
      encoding: "utf-8" as const,
    })),
    ...(await Promise.all(batch.map((b) => photoFiles(admin, b.ex, b.entry)))).flat(),
  ];

  const branch = `reps-exercises-${localISODate()}-${Math.random().toString(36).slice(2, 7)}`;
  const pr = await openFreeDbPr(token, {
    branch,
    title: prTitle(entries),
    body: prBody(entries),
    files,
    editDist: (dist) => addToDist(dist, entries),
  });
  if ("pending" in pr) return { waiting: waiting.length, sent: 0, pending: pr.pending };

  const { data: sub, error: subError } = await admin
    .from("exercise_submissions")
    .insert({ pr_number: pr.number, pr_url: pr.url, branch, status: "open" })
    .select("id")
    .single();
  if (subError) throw subError;

  for (const { ex, entry } of batch) {
    const { error: exError } = await admin
      .from("custom_exercises")
      .update({
        publish_status: "submitted",
        submission_id: sub.id,
        published_slug: entry.id,
      })
      .eq("id", ex.id);
    if (exError) throw exError;
  }
  return { waiting: waiting.length, sent: batch.length, pr: pr.url };
}
