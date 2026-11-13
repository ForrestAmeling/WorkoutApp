import { describe, expect, it } from "vitest";
import { matchOriginalExercise, replacedSlotExercise } from "./routine-edit";

const day1 = [
  { id: "a1", name: "Dumbbell Bicep Curl" },
  { id: "a2", name: "Hip Adductor" },
];
const day2 = [
  { id: "b1", name: "Farmer's Walk" },
  { id: "b2", name: "Hip Adductor" },
];
const all = [...day1, ...day2];

describe("matchOriginalExercise", () => {
  it("keeps a repeated exercise on its own day", () => {
    const claimed = new Set<string>();
    expect(matchOriginalExercise("Hip Adductor", day2, all, claimed)?.id).toBe("b2");
    expect(matchOriginalExercise("hip adductor", day1, all, claimed)?.id).toBe("a2");
  });

  it("ignores punctuation/abbreviations and follows moves between days", () => {
    const claimed = new Set<string>();
    expect(matchOriginalExercise("Farmers Walk", day1, all, claimed)?.id).toBe("b1");
    expect(matchOriginalExercise("DB Bicep Curl", day2, all, claimed)?.id).toBe("a1");
  });

  it("claims each original once and returns null for new exercises", () => {
    const claimed = new Set<string>();
    expect(matchOriginalExercise("Hip Adductor", day1, all, claimed)?.id).toBe("a2");
    expect(matchOriginalExercise("Hip Adductor", day1, all, claimed)?.id).toBe("b2");
    expect(matchOriginalExercise("Hip Adductor", day1, all, claimed)).toBeNull();
    expect(matchOriginalExercise("Hammer Curl", day1, all, new Set())).toBeNull();
  });
});

describe("replacedSlotExercise", () => {
  it("returns the slot's exercise only when it was swapped out", () => {
    expect(replacedSlotExercise(day1[0], ["Hammer Curl", "Hip Adductor"])).toBe(day1[0]);
    expect(replacedSlotExercise(day1[0], ["Hip Adductor", "Dumbbell Bicep Curl"])).toBeUndefined();
    expect(replacedSlotExercise(undefined, ["Anything"])).toBeUndefined();
  });
});
