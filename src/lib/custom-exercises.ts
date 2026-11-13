import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreLibraryHit } from "./exercise-match";
import type { LibraryExercise } from "./types";

/**
 * User-created exercises ("My exercises"), stored in custom_exercises and
 * shaped like free-exercise-db entries. A routine exercise links to one via
 * exercises.library_id = "user:<id>", so everything that already follows
 * library_id (copy, weight-suggestion history, progress grouping) treats it
 * like any library pick.
 */
export const CUSTOM_EXERCISE_PREFIX = "user:";
export const EXERCISE_IMAGE_BUCKET = "exercise-images";
/** Photos are private storage objects, served through this signed-URL route. */
export const EXERCISE_IMAGE_ROUTE = "/api/exercise-images/";
export const MAX_EXERCISE_IMAGES = 4;
const MAX_STEPS = 20;
const MAX_MUSCLES = 6;

// Same vocabularies as free-exercise-db.
export const EXERCISE_LEVELS = ["beginner", "intermediate", "expert"] as const;
export const EXERCISE_FORCES = ["pull", "push", "static"] as const;
export const EXERCISE_MECHANICS = ["compound", "isolation"] as const;
export const EXERCISE_CATEGORIES = [
  "strength",
  "stretching",
  "plyometrics",
  "strongman",
  "powerlifting",
  "cardio",
  "olympic weightlifting",
] as const;

export type ExerciseVisibility = "private" | "shared";

/**
 * Publishing a shared exercise to free-exercise-db: the owner requests it,
 * an app admin approves or declines, the daily cron sends approved ones
 * upstream as one pull request, then tracks whether it was merged.
 * Owners can only move none/rejected/closed → requested and back to none
 * (enforced by a trigger in supabase/exercise-publishing.sql).
 */
export type PublishStatus =
  | "none"
  | "requested"
  | "approved"
  | "rejected"
  | "submitted"
  | "merged"
  | "closed";

export type CustomExercise = {
  id: string;
  user_id: string;
  name: string;
  visibility: ExerciseVisibility;
  equipment: string | null;
  level: string | null;
  force: string | null;
  mechanic: string | null;
  category: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  instructions: string[];
  /** Storage object paths ("<user_id>/<file>"), first one is the thumbnail. */
  images: string[];
  publish_status: PublishStatus;
  publish_consented_at: string | null;
  publish_reviewed_at: string | null;
  /** Why it was declined, shown to the owner. */
  publish_note: string | null;
  /** Its id in free-exercise-db once submitted. */
  published_slug: string | null;
  submission_id: string | null;
  created_at: string;
  updated_at: string;
  /** Joined by listOwnCustomExercises. */
  submission?: { pr_number: number | null; pr_url: string | null } | null;
};

export type CustomExerciseInput = Pick<
  CustomExercise,
  | "name"
  | "visibility"
  | "equipment"
  | "level"
  | "force"
  | "mechanic"
  | "category"
  | "primary_muscles"
  | "secondary_muscles"
  | "instructions"
  | "images"
>;

/** What free-exercise-db's schema.json requires beyond what Reps does. */
export function publishProblems(ex: CustomExerciseInput): string[] {
  const missing: string[] = [];
  if (ex.visibility !== "shared") missing.push("set it to Shared");
  if (!ex.level) missing.push("a level");
  if (!ex.category) missing.push("a category");
  if (ex.primary_muscles.length === 0) missing.push("a primary muscle");
  if (ex.instructions.length === 0) missing.push("steps");
  return missing;
}

/** Owner-facing status line; null when there's nothing to say. */
export function publishStatusLabel(ex: Pick<CustomExercise, "publish_status" | "publish_note">) {
  switch (ex.publish_status) {
    case "requested":
      return "Waiting for review before it goes to free-exercise-db";
    case "approved":
      return "Approved — goes out with the next free-exercise-db batch";
    case "rejected":
      return ex.publish_note ? `Not submitted: ${ex.publish_note}` : "Not submitted after review";
    case "submitted":
      return "Submitted to free-exercise-db — waiting on their maintainer";
    case "merged":
      return "Accepted into free-exercise-db";
    case "closed":
      return "free-exercise-db didn't accept this one";
    default:
      return null;
  }
}

export function isCustomExerciseId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.startsWith(CUSTOM_EXERCISE_PREFIX);
}

export function customExerciseLibraryId(id: string) {
  return CUSTOM_EXERCISE_PREFIX + id;
}

export function customIdFromLibraryId(libraryId: string | null | undefined) {
  return isCustomExerciseId(libraryId)
    ? libraryId.slice(CUSTOM_EXERCISE_PREFIX.length)
    : null;
}

export function exerciseImageUrl(path: string) {
  return EXERCISE_IMAGE_ROUTE + path.split("/").map(encodeURIComponent).join("/");
}

/** These need next/image's `unoptimized` — the optimizer can't send the viewer's cookies. */
export function isPrivateExerciseImage(url: string | null | undefined) {
  return typeof url === "string" && url.startsWith(EXERCISE_IMAGE_ROUTE);
}

export function customToLibraryExercise(
  row: CustomExercise,
  viewerId: string
): LibraryExercise {
  const images = row.images.map(exerciseImageUrl);
  return {
    id: customExerciseLibraryId(row.id),
    name: row.name,
    equipment: row.equipment,
    level: row.level,
    mechanic: row.mechanic,
    force: row.force,
    primaryMuscles: row.primary_muscles,
    secondaryMuscles: row.secondary_muscles,
    instructions: row.instructions,
    category: row.category,
    images,
    imageUrl: images[0] ?? null,
    source: row.user_id === viewerId ? "mine" : "shared",
  };
}

/** One step per line; drops list markers like "1.", "2)", "-", "•". */
export function splitInstructions(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v ? v.slice(0, max) : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function muscleList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const m of value) {
    const v = cleanText(m, 40)?.toLowerCase();
    if (v) out.add(v);
  }
  return [...out].slice(0, MAX_MUSCLES);
}

const IMAGE_FILE = /^[\w-]+\.(?:jpe?g|png|webp)$/i;

/**
 * Validate a create/update payload. Image paths must sit in the owner's
 * own storage folder — the bucket policies enforce uploads, this keeps a
 * row from pointing at someone else's file.
 */
export function normalizeCustomExerciseInput(
  raw: unknown,
  ownerId: string
): { ok: true; value: CustomExerciseInput } | { ok: false; error: string } {
  const body = (raw ?? {}) as Record<string, unknown>;
  const name = cleanText(body.name, 80);
  if (!name) return { ok: false, error: "Give the exercise a name." };

  const steps = Array.isArray(body.instructions)
    ? body.instructions.flatMap((s) => (typeof s === "string" ? splitInstructions(s) : []))
    : typeof body.instructions === "string"
      ? splitInstructions(body.instructions)
      : [];

  const images: string[] = [];
  for (const p of Array.isArray(body.images) ? body.images : []) {
    if (typeof p !== "string") continue;
    const [folder, file, ...rest] = p.split("/");
    if (folder !== ownerId || !file || rest.length || !IMAGE_FILE.test(file)) {
      return { ok: false, error: "One of the photos isn't yours." };
    }
    if (!images.includes(p)) images.push(p);
  }
  if (images.length > MAX_EXERCISE_IMAGES) {
    return { ok: false, error: `Up to ${MAX_EXERCISE_IMAGES} photos.` };
  }

  const primary = muscleList(body.primary_muscles);
  return {
    ok: true,
    value: {
      name,
      visibility: body.visibility === "shared" ? "shared" : "private",
      equipment: cleanText(body.equipment, 40)?.toLowerCase() ?? null,
      level: pick(body.level, EXERCISE_LEVELS),
      force: pick(body.force, EXERCISE_FORCES),
      mechanic: pick(body.mechanic, EXERCISE_MECHANICS),
      category: pick(body.category, EXERCISE_CATEGORIES),
      primary_muscles: primary,
      secondary_muscles: muscleList(body.secondary_muscles).filter(
        (m) => !primary.includes(m)
      ),
      instructions: steps.slice(0, MAX_STEPS).map((s) => s.slice(0, 500)),
      images,
    },
  };
}

/**
 * Filter custom exercises like searchExerciseLibrary does the library:
 * same muscle/equipment filters and name scoring. Yours sort before
 * shared ones.
 */
export function filterCustomExercises(
  list: LibraryExercise[],
  opts: { q?: string; muscle?: string; equipment?: string }
): LibraryExercise[] {
  const q = opts.q?.trim().toLowerCase() ?? "";
  const muscle = opts.muscle?.trim().toLowerCase() ?? "";
  const equipment = opts.equipment?.trim().toLowerCase() ?? "";
  const mineFirst = (ex: LibraryExercise) => (ex.source === "mine" ? 0 : 1);

  const filtered = list.filter(
    (ex) =>
      (!muscle ||
        ex.primaryMuscles.includes(muscle) ||
        ex.secondaryMuscles.includes(muscle)) &&
      (!equipment || (ex.equipment ?? "") === equipment)
  );
  if (!q) {
    return filtered.sort(
      (a, b) => mineFirst(a) - mineFirst(b) || a.name.localeCompare(b.name)
    );
  }
  return filtered
    .map((ex) => ({ ex, score: scoreLibraryHit(q, { id: "", name: ex.name }) }))
    .filter((row) => row.score >= 55)
    .sort((a, b) => mineFirst(a.ex) - mineFirst(b.ex) || b.score - a.score)
    .map((row) => row.ex);
}

/** Your exercises plus everyone's shared ones (RLS decides). */
export async function listVisibleCustomExercises(
  supabase: SupabaseClient
): Promise<CustomExercise[]> {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as CustomExercise[];
}

export async function listOwnCustomExercises(
  supabase: SupabaseClient,
  userId: string
): Promise<CustomExercise[]> {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("*, submission:exercise_submissions(pr_number, pr_url)")
    .eq("user_id", userId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as CustomExercise[];
}

export async function getCustomExercise(
  supabase: SupabaseClient,
  id: string
): Promise<CustomExercise | null> {
  const { data, error } = await supabase
    .from("custom_exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as CustomExercise) ?? null;
}

/** Name → visible custom exercise, for the AI routine builders to prefer. */
export function customExerciseNameIndex(
  rows: CustomExercise[],
  viewerId: string
): Map<string, LibraryExercise> {
  const index = new Map<string, LibraryExercise>();
  // Shared first so your own exercise wins on a name clash.
  const ordered = [...rows].sort(
    (a, b) => Number(a.user_id === viewerId) - Number(b.user_id === viewerId)
  );
  for (const row of ordered) {
    index.set(row.name.trim().toLowerCase(), customToLibraryExercise(row, viewerId));
  }
  return index;
}
