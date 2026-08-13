const ABBREVIATIONS: Record<string, string> = {
  db: "dumbbell",
  dbs: "dumbbell",
  dumbell: "dumbbell",
  dumbells: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ez: "ez",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  dl: "deadlift",
  oh: "overhead",
  inc: "incline",
  dec: "decline",
  cg: "close grip",
  lat: "lat",
};

const LOOKUP_MIN_MULTI = 76;
const LOOKUP_MIN_SINGLE = 92;

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[/_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (ABBREVIATIONS[token] ?? token).split(/\s+/))
    .join(" ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) < 3) return 0;
  if (a.startsWith(b) || b.startsWith(a)) return 0.92;
  const d = levenshtein(a, b);
  if (d === 1) return 0.88;
  if (d === 2 && Math.max(a.length, b.length) >= 7) return 0.72;
  return 0;
}

export function scoreNameMatch(query: string, candidate: string): number {
  const q = normalizeExerciseName(query);
  const c = normalizeExerciseName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  const qTokens = q.split(" ");
  if (qTokens.length === 1) return 0;
  if (c.includes(q)) {
    return Math.min(96, 88 + Math.max(0, 8 - (c.length - q.length) / 8));
  }
  if (q.includes(c) && c.length >= 10) return 82;

  const cTokens = c.split(" ");
  const used = new Set<number>();
  let matched = 0;
  let simSum = 0;
  for (const qt of qTokens) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < cTokens.length; i++) {
      if (used.has(i)) continue;
      const s = tokenSimilarity(qt, cTokens[i]);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    }
    if (best >= 0.72 && bestIdx >= 0) {
      used.add(bestIdx);
      matched += 1;
      simSum += best;
    }
  }
  const coverage = simSum / qTokens.length;
  const precision = matched / Math.max(cTokens.length, 1);
  return 100 * (0.7 * coverage + 0.3 * precision);
}

export function scoreLibraryHit(
  query: string,
  ex: { id: string; name: string }
): number {
  const idName = ex.id.replace(/[_-]+/g, " ");
  return Math.max(scoreNameMatch(query, ex.name), scoreNameMatch(query, idName));
}

export function findBestLibraryMatch<T extends { id: string; name: string }>(
  all: T[],
  name: string
): T | null {
  const q = normalizeExerciseName(name);
  if (!q) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const ex of all) {
    const s = scoreLibraryHit(name, ex);
    if (s > bestScore) {
      bestScore = s;
      best = ex;
    }
  }
  const min = q.split(" ").length >= 2 ? LOOKUP_MIN_MULTI : LOOKUP_MIN_SINGLE;
  if (!best || bestScore < min) return null;
  return best;
}
