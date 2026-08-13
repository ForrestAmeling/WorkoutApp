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

function normalize(raw: RawExercise): LibraryExercise {
  const images = raw.images ?? [];
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
    imageUrl: libraryImageUrl(images[0]),
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

  return all
    .filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q) && !ex.id.toLowerCase().includes(q)) {
        return false;
      }
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
    })
    .slice(0, limit);
}

export async function findLibraryByName(
  name: string
): Promise<LibraryExercise | null> {
  const all = await loadExerciseLibrary();
  const needle = name.trim().toLowerCase();
  const exact = all.find((e) => e.name.toLowerCase() === needle);
  if (exact) return exact;
  const partial = all.find(
    (e) =>
      e.name.toLowerCase().includes(needle) ||
      needle.includes(e.name.toLowerCase())
  );
  return partial ?? null;
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
