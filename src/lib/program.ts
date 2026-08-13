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

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function localISODate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return localISODate();
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string | undefined | null): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatHumanDate(
  iso: string,
  options?: Intl.DateTimeFormatOptions
) {
  return parseISODate(iso).toLocaleDateString(
    undefined,
    options ?? {
      weekday: "short",
      month: "short",
      day: "numeric",
    }
  );
}

export function shiftISODate(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

export function formatTarget(sets: number, low: number, high: number) {
  return `${sets}×${low}–${high}`;
}
