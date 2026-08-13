import type { WeekFocus } from "./types";

export const WEEK_FOCI: WeekFocus[] = ["light", "middle", "heavy"];

export const WEEK_LABELS: Record<WeekFocus, string> = {
  light: "Light",
  middle: "Middle",
  heavy: "Heavy",
};

export function nextPosition(
  weekFocus: WeekFocus,
  dayNumber: number,
  maxDay = 5
): { weekFocus: WeekFocus; dayNumber: number } {
  if (dayNumber < maxDay) {
    return { weekFocus, dayNumber: dayNumber + 1 };
  }
  const idx = WEEK_FOCI.indexOf(weekFocus);
  if (idx < WEEK_FOCI.length - 1) {
    return { weekFocus: WEEK_FOCI[idx + 1], dayNumber: 1 };
  }
  return { weekFocus: "light", dayNumber: 1 };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatTarget(sets: number, low: number, high: number) {
  return `${sets}×${low}–${high}`;
}
