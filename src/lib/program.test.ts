import { describe, expect, it } from "vitest";
import {
  formatHumanDate,
  isISODate,
  localISODate,
  nextPosition,
  shiftISODate,
  todayISO,
} from "./program";
import { clampDelta, roundToPlate, ruleBasedSuggestion } from "./weight-suggestion";
import { isStuckLift } from "./progress";

describe("local calendar dates", () => {
  it("formats local YYYY-MM-DD instead of UTC", () => {
    const eveningEastern = new Date(2026, 7, 13, 22, 0, 0);
    expect(localISODate(eveningEastern)).toBe("2026-08-13");
    expect(isISODate("2026-08-13")).toBe(true);
    expect(isISODate("08/13/2026")).toBe(false);
  });

  it("shifts and formats human dates without UTC drift", () => {
    expect(shiftISODate("2026-08-13", -1)).toBe("2026-08-12");
    expect(formatHumanDate("2026-08-13", { month: "short", day: "numeric" })).toMatch(
      /Aug/
    );
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("day advance", () => {
  it("moves to the next day in the same week focus", () => {
    expect(nextPosition("light", 2, 5)).toEqual({
      weekFocus: "light",
      dayNumber: 3,
    });
  });

  it("wraps from last heavy day to light day 1", () => {
    expect(nextPosition("heavy", 5, 5)).toEqual({
      weekFocus: "light",
      dayNumber: 1,
    });
  });
});

describe("weight suggestion clamp", () => {
  it("rounds to 2.5 lb plates", () => {
    expect(roundToPlate(101)).toBe(100);
    expect(roundToPlate(103.8)).toBe(105);
  });

  it("caps AI deltas at 15%", () => {
    expect(clampDelta(200, 100)).toBe(115);
    expect(clampDelta(50, 100)).toBe(85);
  });

  it("drops weight when reps miss the range", () => {
    const result = ruleBasedSuggestion(
      [{ weight: 100, reps: 4, set_number: 1 }],
      8,
      12
    );
    expect(result?.source).toBe("rule");
    expect(result!.suggested_weight).toBeLessThan(100);
  });
});

describe("stuck lifts", () => {
  it("flags four sessions at the same top weight", () => {
    const points = [1, 2, 3, 4].map((d) => ({
      date: `2026-08-0${d}`,
      weekFocus: "heavy" as const,
      maxWeight: 100,
      avgWeight: 100,
      avgReps: 5,
      maxReps: 5,
      sets: 3,
      volume: 1500,
    }));
    expect(isStuckLift(points)).toBe(true);
    points[3].maxWeight = 105;
    expect(isStuckLift(points)).toBe(false);
  });
});
