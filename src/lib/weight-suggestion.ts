export type HistorySet = {
  weight: number;
  reps: number;
  set_number: number;
};

export type SuggestionResult = {
  suggested_weight: number;
  rationale: string;
  source: "ai" | "rule" | "none";
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

  let suggested = lastWeight;
  let rationale: string;

  if (avgReps < repLow) {
    suggested = roundToPlate(lastWeight * 0.925);
    rationale = `Last sets averaged ${avgReps.toFixed(1)} reps below ${repLow}. Suggest ~7.5% less.`;
  } else if (avgReps > repHigh) {
    suggested = roundToPlate(lastWeight * 1.075);
    rationale = `Last sets averaged ${avgReps.toFixed(1)} reps above ${repHigh}. Suggest ~7.5% more.`;
  } else {
    rationale = `Last sets landed in the ${repLow}–${repHigh} range. Keep the same weight.`;
  }

  return {
    suggested_weight: clampDelta(suggested, lastWeight),
    rationale,
    source: "rule",
  };
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

export function buildDeepSeekPrompt(args: {
  exerciseName: string;
  weekFocus: string;
  repLow: number;
  repHigh: number;
  history: HistorySet[];
}) {
  const historyLines = args.history
    .map(
      (s, i) =>
        `${i + 1}. set ${s.set_number}: ${s.weight} lb × ${s.reps} reps`
    )
    .join("\n");

  return `You are a strength coach helping with a 3-week light/middle/heavy periodization program.
Units are pounds (lb).

Exercise: ${args.exerciseName}
Week focus: ${args.weekFocus}
Target rep range: ${args.repLow}-${args.repHigh}

Recent logged sets for this SAME exercise and SAME week focus (newest first):
${historyLines}

Suggest a starting weight for the next set. Rules:
- Compare only to same week-focus history (already filtered).
- If they missed the bottom of the range, suggest ~5-10% less.
- If they blew past the top, suggest ~5-10% more.
- If they landed in range, suggest the same weight.
- Keep changes conservative; round to nearest 2.5 lb.

Respond with ONLY valid JSON, no markdown:
{"suggested_weight": number, "rationale": "short reason"}`;
}
