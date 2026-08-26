import { describe, expect, it } from "vitest";
import {
  crossFocusSuggestion,
  ruleBasedSuggestion,
} from "./weight-suggestion";

describe("ruleBasedSuggestion ceiling boundary", () => {
  it("triggers a weight increase when avg reps land exactly on repHigh", () => {
    // 25 reps on every set of a 20-25 light range should bump next time,
    // not just strictly exceeding 25.
    const result = ruleBasedSuggestion(
      [
        { weight: 100, reps: 25, set_number: 1 },
        { weight: 100, reps: 25, set_number: 2 },
        { weight: 100, reps: 25, set_number: 3 },
      ],
      20,
      25
    );

    expect(result?.source).toBe("rule");
    expect(result!.suggested_weight).toBeGreaterThan(100);
  });
});

describe("ruleBasedSuggestion magnitude scaling", () => {
  it("scales the adjustment to how far outside the range they landed", () => {
    const lastWeight = 200;

    const smallMiss = ruleBasedSuggestion(
      [{ weight: lastWeight, reps: 7, set_number: 1 }],
      8,
      12
    )!;
    const bigMiss = ruleBasedSuggestion(
      [{ weight: lastWeight, reps: 2, set_number: 1 }],
      8,
      12
    )!;

    const smallDrop = lastWeight - smallMiss.suggested_weight;
    const bigDrop = lastWeight - bigMiss.suggested_weight;

    expect(smallDrop).toBeGreaterThan(0);
    expect(bigDrop).toBeGreaterThan(smallDrop);
  });
});

describe("crossFocusSuggestion", () => {
  it("derives a heavier weight from light-range/high-rep history for a lower target rep range", () => {
    const lastWeight = 50;
    const lightHistory = [
      { weight: lastWeight, reps: 25, set_number: 1 },
      { weight: lastWeight, reps: 25, set_number: 2 },
      { weight: lastWeight, reps: 25, set_number: 3 },
    ];

    // No history yet for a heavy 3-5 rep range.
    const result = crossFocusSuggestion(lightHistory, 3, 5);

    expect(result?.source).toBe("estimate");
    expect(result!.suggested_weight).toBeGreaterThan(lastWeight);
  });

  it("derives a lighter weight from heavy-range/low-rep history for a higher target rep range", () => {
    const lastWeight = 200;
    const heavyHistory = [{ weight: lastWeight, reps: 5, set_number: 1 }];

    // No history yet for a light 20-25 rep range.
    const result = crossFocusSuggestion(heavyHistory, 20, 25);

    expect(result?.source).toBe("estimate");
    expect(result!.suggested_weight).toBeLessThan(lastWeight);
  });

  it("returns null when there is no history at all to estimate from", () => {
    expect(crossFocusSuggestion([], 8, 12)).toBeNull();
  });
});
