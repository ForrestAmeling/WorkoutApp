import type { WeekFocus } from "./types";

export type PeriodizationMode =
  | "none"
  | "full"
  | "light"
  | "middle"
  | "heavy";

export const PERIODIZATION_OPTIONS: {
  mode: PeriodizationMode;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    mode: "none",
    label: "No week focus",
    short: "Fixed",
    hint: "Same sets/reps every week",
  },
  {
    mode: "full",
    label: "Light → Middle → Heavy",
    short: "Full cycle",
    hint: "Rotate all three week focuses",
  },
  {
    mode: "light",
    label: "Light only",
    short: "Light",
    hint: "Higher reps, stay on light targets",
  },
  {
    mode: "middle",
    label: "Middle only",
    short: "Middle",
    hint: "Moderate sets/reps only",
  },
  {
    mode: "heavy",
    label: "Heavy only",
    short: "Heavy",
    hint: "Lower reps, stay on heavy targets",
  },
];

export function fociForMode(mode: PeriodizationMode): WeekFocus[] {
  switch (mode) {
    case "full":
      return ["light", "middle", "heavy"];
    case "light":
      return ["light"];
    case "heavy":
      return ["heavy"];
    case "middle":
      return ["middle"];
    case "none":
    default:
      return ["middle"];
  }
}

export function usesPeriodization(mode: PeriodizationMode) {
  return mode !== "none";
}

export function showsWeekPicker(mode: PeriodizationMode) {
  return mode === "full";
}

export function defaultWeekFocus(mode: PeriodizationMode): WeekFocus {
  if (mode === "light" || mode === "heavy" || mode === "middle") return mode;
  if (mode === "full") return "light";
  return "middle";
}

export function parsePeriodizationMode(
  value: unknown
): PeriodizationMode | null {
  if (
    value === "none" ||
    value === "full" ||
    value === "light" ||
    value === "middle" ||
    value === "heavy"
  ) {
    return value;
  }
  return null;
}

export type FocusTarget = {
  target_sets: number;
  rep_low: number;
  rep_high: number;
};

/** Default set/rep scheme by week focus for AI/manual seeding. */
export function defaultTargetsForFocus(focus: WeekFocus): FocusTarget {
  switch (focus) {
    case "light":
      // Higher-rep pump / recovery week
      return { target_sets: 3, rep_low: 20, rep_high: 25 };
    case "heavy":
      return { target_sets: 4, rep_low: 4, rep_high: 6 };
    case "middle":
    default:
      return { target_sets: 3, rep_low: 8, rep_high: 12 };
  }
}

/** True if the user is asking to change sets/reps/periodization — not just exercises/equipment. */
export function promptAsksForSetRepChanges(prompt: string) {
  return /\b(sets?|reps?|rep\s*ranges?|volume|intensity|periodiz\w*|light\s*(week|focus|targets?)|heavy\s*(week|focus|targets?)|middle\s*(week|focus|targets?)|more\s+reps?|fewer\s+reps?|lower\s+reps?|higher\s+reps?|rep\s*counts?)\b/i.test(
    prompt
  );
}

/**
 * Enforce clear Light / Middle / Heavy variance.
 * Middle stays ~8–12; light higher; heavy lower.
 */
export function normalizeFocusTarget(
  focus: WeekFocus,
  raw?: Partial<{ sets: number; target_sets: number; rep_low: number; rep_high: number }> | null
): FocusTarget {
  const dflt = defaultTargetsForFocus(focus);
  let target_sets = Math.min(
    6,
    Math.max(1, Number(raw?.target_sets ?? raw?.sets) || dflt.target_sets)
  );
  let rep_low = Math.min(
    40,
    Math.max(1, Number(raw?.rep_low) || dflt.rep_low)
  );
  let rep_high = Math.min(
    40,
    Math.max(1, Number(raw?.rep_high) || dflt.rep_high)
  );

  if (focus === "middle") {
    // Keep middle in the classic hypertrophy band
    rep_low = 8;
    rep_high = 12;
    if (target_sets < 2) target_sets = 3;
  } else if (focus === "light") {
    if (rep_low < 20) rep_low = 20;
    if (rep_high < Math.max(rep_low, 25)) rep_high = Math.max(rep_low, 25);
    if (rep_high > 30) rep_high = 30;
    if (target_sets > 4) target_sets = 3;
  } else if (focus === "heavy") {
    if (rep_high > 6) rep_high = 6;
    if (rep_low > rep_high) rep_low = Math.max(3, rep_high - 2);
    if (rep_low < 3) rep_low = 3;
    if (target_sets < 3) target_sets = 4;
  }

  if (rep_low > rep_high) {
    const tmp = rep_low;
    rep_low = rep_high;
    rep_high = tmp;
  }

  return { target_sets, rep_low, rep_high };
}

export function modeLabel(mode: PeriodizationMode) {
  return (
    PERIODIZATION_OPTIONS.find((o) => o.mode === mode)?.label ?? "No week focus"
  );
}
