export type HistorySet = {
  weight: number;
  reps: number;
  set_number: number;
};

export type SuggestionResult = {
  suggested_weight: number;
  rationale: string;
  source: "ai" | "rule" | "estimate" | "none";
};

/** Deterministic fallback from last logged performance vs rep range. */
export function ruleBasedSuggestion(
  history: HistorySet[],
  repLow: number,
  repHigh: number
): SuggestionResult | null {
  if (history.length === 0) return null;

  const lastWeight = history[0].weight;
  const avgReps =
    history.reduce((sum, s) => sum + s.reps, 0) / history.length;
  const rangeWidth = repHigh - repLow;

  let suggested = lastWeight;
  let rationale: string;

  if (avgReps < repLow) {
    const pct = scaledPct(repLow - avgReps, rangeWidth);
    suggested = roundToPlate(lastWeight * (1 - pct));
    rationale = `Last sets averaged ${avgReps.toFixed(1)} reps below ${repLow}. Suggest ~${(pct * 100).toFixed(1)}% less.`;
  } else if (avgReps >= repHigh) {
    // >= (not just >) so reaching the very top of the range every set —
    // the standard double-progression "time to add weight" signal — still
    // reliably triggers a bump, not only strictly blowing past it.
    const pct = scaledPct(avgReps - repHigh, rangeWidth);
    suggested = roundToPlate(lastWeight * (1 + pct));
    rationale = `Last sets averaged ${avgReps.toFixed(1)} reps at/above ${repHigh}. Suggest ~${(pct * 100).toFixed(1)}% more.`;
  } else {
    rationale = `Last sets landed in the ${repLow}–${repHigh} range. Keep the same weight.`;
  }

  return {
    suggested_weight: clampDelta(suggested, lastWeight),
    rationale,
    source: "rule",
  };
}

/**
 * Scales the % weight adjustment to how far outside the rep range they
 * landed, instead of always moving by the same flat amount regardless of
 * whether they missed by 1 rep or 15. Barely missing/exceeding the range
 * nudges ~5%; a big miss scales up toward clampDelta's ±15% ceiling.
 */
function scaledPct(missReps: number, rangeWidth: number) {
  const ratio = missReps / Math.max(1, rangeWidth);
  return Math.min(0.15, Math.max(0.05, 0.05 + ratio * 0.075));
}

export function clampDelta(suggested: number, lastWeight: number, pct = 0.15) {
  const min = lastWeight * (1 - pct);
  const max = lastWeight * (1 + pct);
  return roundToPlate(Math.min(max, Math.max(min, suggested)));
}

export function roundToPlate(weight: number) {
  // Nearest 2.5 lb — common dumbbell/plate increment
  return Math.round(weight / 2.5) * 2.5;
}

/** Epley formula: estimated one-rep-max implied by a single logged set. */
export function estimatedOneRepMax(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

/** Inverse of the Epley formula: weight expected to hit `targetReps` given a 1RM. */
export function weightForTargetReps(oneRepMax: number, targetReps: number) {
  return oneRepMax / (1 + targetReps / 30);
}

/**
 * Cross-focus fallback for when the target week focus has no logged
 * history yet, but another focus (a different rep range) does. Estimates
 * a one-rep-max from whichever history is available via the Epley
 * formula, then inverts it for the target rep range's midpoint. This is
 * what lets, e.g., a Light-week 20-25 rep set translate into a sane
 * starting weight for a never-logged Middle 8-12 range (and vice versa).
 *
 * Deliberately does NOT go through clampDelta — that ±15% same-weight
 * guard is meant for a same-focus rule adjustment, and would be wrong
 * here: jumping from a high-rep range to a low-rep range (or the reverse)
 * legitimately means a much different suggested weight. Only a loose
 * sanity bound applies (finite, positive).
 */
export function crossFocusSuggestion(
  history: HistorySet[],
  repLow: number,
  repHigh: number
): SuggestionResult | null {
  if (history.length === 0) return null;

  const targetReps = (repLow + repHigh) / 2;
  const bestOneRepMax = history.reduce(
    (max, s) => Math.max(max, estimatedOneRepMax(s.weight, s.reps)),
    0
  );

  const suggested = roundToPlate(
    weightForTargetReps(bestOneRepMax, targetReps)
  );

  if (!Number.isFinite(suggested) || suggested <= 0) return null;

  return {
    suggested_weight: suggested,
    rationale: `No history for this week focus yet — estimated from your other logged weeks for a ~${targetReps.toFixed(0)}-rep target.`,
    source: "estimate",
  };
}

export function buildDeepSeekPrompt(args: {
  exerciseName: string;
  weekFocus: string;
  repLow: number;
  repHigh: number;
  history: HistorySet[];
  /**
   * True when `history` was logged under a different week focus than
   * `weekFocus` (the target has no history of its own yet), so the
   * prompt should frame it as a cross-range estimate instead of a direct
   * same-range comparison.
   */
  crossFocus?: boolean;
}) {
  const historyLines = args.history
    .map(
      (s, i) =>
        `${i + 1}. set ${s.set_number}: ${s.weight} lb × ${s.reps} reps`
    )
    .join("\n");

  const historyDescription = args.crossFocus
    ? "Recent logged sets for this SAME exercise but from a DIFFERENT week focus — there is no history yet for the target focus/rep range below (newest first):"
    : "Recent logged sets for this SAME exercise and SAME week focus (newest first):";

  const crossFocusRule = args.crossFocus
    ? "- The history above is from a different rep range than the target below — do NOT just reuse the same weight. Estimate a one-rep-max from the history (weight and reps together) and scale it to the target rep range: a heavier weight for a lower target rep count, a lighter weight for a higher one."
    : "- Compare only to same week-focus history (already filtered).";

  return `You are a strength coach helping with a 3-week light/middle/heavy periodization program.
Units are pounds (lb).

Exercise: ${args.exerciseName}
Week focus: ${args.weekFocus}
Target rep range: ${args.repLow}-${args.repHigh}

${historyDescription}
${historyLines}

Suggest a starting weight for the next set. Rules:
${crossFocusRule}
- If they missed the bottom of the range, suggest ~5-10% less.
- If they blew past the top, suggest ~5-10% more.
- If they landed in range, suggest the same weight.
- Keep changes conservative; round to nearest 2.5 lb.

Respond with ONLY valid JSON, no markdown:
{"suggested_weight": number, "rationale": "short reason"}`;
}
