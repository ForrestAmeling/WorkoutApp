import { findBestLibraryMatch, scoreLibraryHit } from "./exercise-match";
import type { LibraryExercise } from "./types";

const EXERCISES_JSON_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

type RawExercise = {
  id: string;
  name: string;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string | null;
  images?: string[];
};

let cache: LibraryExercise[] | null = null;
let cacheAt = 0;
const CACHE_MS = 1000 * 60 * 60 * 12; // 12 hours

export function libraryImageUrl(path: string | undefined | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return IMAGE_BASE + path.replace(/^\//, "");
}

/**
 * next/image throws a hard render-time error ("hostname is not
 * configured") for any src whose host isn't in next.config.ts's
 * images.remotePatterns — unlike a plain <img>, which just shows a broken
 * icon. exercise/library image URLs are meant to always be under
 * IMAGE_BASE (the one host next.config.ts whitelists) or a local /public
 * path, but a stray/legacy image_url stored on an exercises row wouldn't
 * be caught by that until it crashed a page. Route every dynamic image src
 * through this first so anything unexpected degrades to the default icon
 * instead of crashing.
 */
export function safeExerciseImageUrl(url: string | null | undefined): string {
  if (!url) return "/icon-192.png";
  if (url.startsWith("/")) return url;
  if (url.startsWith(IMAGE_BASE)) return url;
  return "/icon-192.png";
}

function normalize(raw: RawExercise): LibraryExercise {
  const images = (raw.images ?? [])
    .map((path) => libraryImageUrl(path))
    .filter((url): url is string => Boolean(url));
  return {
    id: raw.id,
    name: raw.name,
    equipment: raw.equipment ?? null,
    level: raw.level ?? null,
    mechanic: raw.mechanic ?? null,
    force: raw.force ?? null,
    primaryMuscles: raw.primaryMuscles ?? [],
    secondaryMuscles: raw.secondaryMuscles ?? [],
    instructions: raw.instructions ?? [],
    category: raw.category ?? null,
    images,
    imageUrl: images[0] ?? null,
  };
}

export async function loadExerciseLibrary(): Promise<LibraryExercise[]> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;

  const res = await fetch(EXERCISES_JSON_URL, {
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) {
    throw new Error(`Failed to load exercise library (${res.status})`);
  }
  const data = (await res.json()) as RawExercise[];
  cache = data.map(normalize);
  cacheAt = now;
  return cache;
}

export async function searchExerciseLibrary(opts: {
  q?: string;
  muscle?: string;
  equipment?: string;
  limit?: number;
}): Promise<LibraryExercise[]> {
  const all = await loadExerciseLibrary();
  const q = opts.q?.trim().toLowerCase() ?? "";
  const muscle = opts.muscle?.trim().toLowerCase() ?? "";
  const equipment = opts.equipment?.trim().toLowerCase() ?? "";
  const limit = Math.min(opts.limit ?? 40, 100);

  const filtered = all.filter((ex) => {
    if (
      muscle &&
      !ex.primaryMuscles.some((m) => m.toLowerCase() === muscle) &&
      !ex.secondaryMuscles.some((m) => m.toLowerCase() === muscle)
    ) {
      return false;
    }
    if (equipment && (ex.equipment ?? "").toLowerCase() !== equipment) {
      return false;
    }
    return true;
  });

  if (!q) return filtered.slice(0, limit);

  return filtered
    .map((ex) => ({ ex, score: scoreLibraryHit(q, ex) }))
    .filter((row) => row.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.ex);
}

export async function findLibraryByName(
  name: string
): Promise<LibraryExercise | null> {
  const all = await loadExerciseLibrary();
  return findBestLibraryMatch(all, name);
}

export async function getLibraryExercise(opts: {
  id?: string | null;
  name?: string | null;
}): Promise<LibraryExercise | null> {
  const all = await loadExerciseLibrary();
  if (opts.id) {
    const byId = all.find((e) => e.id === opts.id);
    if (byId) return byId;
  }
  if (opts.name) return findBestLibraryMatch(all, opts.name);
  return null;
}

export function uniqueMuscles(list: LibraryExercise[]) {
  const set = new Set<string>();
  for (const ex of list) {
    for (const m of ex.primaryMuscles) set.add(m);
  }
  return [...set].sort();
}

export function uniqueEquipment(list: LibraryExercise[]) {
  const set = new Set<string>();
  for (const ex of list) {
    if (ex.equipment) set.add(ex.equipment);
  }
  return [...set].sort();
}

export function libraryToExercisePatch(lib: LibraryExercise) {
  return {
    name: lib.name,
    // A user-typed custom exercise (see ExercisePicker/ExerciseHowTo "add
    // your own") is represented as a LibraryExercise with an empty id — it
    // isn't backed by a free-exercise-db row, so it must not be stored as
    // one. `library_id: null` is already a supported value end-to-end (the
    // seeded/cloned routine exercises use it too).
    library_id: lib.id || null,
    image_url: lib.imageUrl,
    muscle_group: lib.primaryMuscles[0] ?? null,
  };
}

/** Builds a LibraryExercise-shaped stand-in for a user-typed custom
 * exercise, so it can flow through the same onPick/onSwitch callbacks as a
 * real free-exercise-db pick. `id: ""` is the signal `libraryToExercisePatch`
 * and the insert paths in RoutineEditor/NewRoutineForm use to store
 * `library_id: null` instead of an id. */
export function customLibraryExercise(name: string): LibraryExercise {
  return {
    id: "",
    name,
    equipment: null,
    level: null,
    mechanic: null,
    force: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    instructions: [],
    category: null,
    images: [],
    imageUrl: null,
  };
}
