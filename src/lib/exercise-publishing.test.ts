import { describe, expect, it } from "vitest";
import type { CustomExercise } from "./custom-exercises";
import {
  addToDist,
  exerciseFileText,
  freeDbId,
  nextPublishDue,
  prBody,
  shouldOpenPr,
  toFreeDbExercise,
} from "./exercise-publishing";

const ex = {
  name: "Cable Hip Thrust",
  force: "push",
  level: "beginner",
  mechanic: "compound",
  equipment: "cable",
  primary_muscles: ["glutes"],
  secondary_muscles: ["hamstrings"],
  instructions: ["Set up.", "Thrust."],
  category: "strength",
  images: ["u/a.jpg", "u/b.jpg"],
} as CustomExercise;

describe("freeDbId", () => {
  it("follows upstream's naming", () => {
    expect(freeDbId("3/4 Sit-Up")).toBe("3_4_Sit-Up");
    expect(freeDbId("Farmer's Walk")).toBe("Farmers_Walk");
    expect(freeDbId("  Cable   Hip Thrust! ")).toBe("Cable_Hip_Thrust");
  });
});

describe("free-exercise-db files", () => {
  const entry = toFreeDbExercise(ex, "Cable_Hip_Thrust");

  it("maps fields with id first and photos under the exercise folder", () => {
    expect(Object.keys(entry)[0]).toBe("id");
    expect(entry.images).toEqual(["Cable_Hip_Thrust/0.jpg", "Cable_Hip_Thrust/1.jpg"]);
    expect(entry.primaryMuscles).toEqual(["glutes"]);
    expect(exerciseFileText(entry).endsWith("}\n")).toBe(true);
  });

  it("inserts into dist in file order and leaves the rest untouched", () => {
    const dist =
      JSON.stringify([{ id: "Barbell_Squat" }, { id: "Deadlift" }], null, 2) + "\n";
    const out = JSON.parse(addToDist(dist, [entry])) as { id: string }[];
    expect(out.map((e) => e.id)).toEqual(["Barbell_Squat", "Cable_Hip_Thrust", "Deadlift"]);
    const appended = JSON.parse(addToDist(dist, [{ ...entry, id: "Zercher_Squat" }]));
    expect(appended.at(-1).id).toBe("Zercher_Squat");
  });

  it("describes the batch in the PR body", () => {
    expect(prBody([entry])).toContain("- Cable Hip Thrust (cable) — 2 photos");
  });
});

describe("shouldOpenPr", () => {
  const now = new Date("2026-12-01T12:00:00Z");

  it("sends as soon as a full batch is waiting", () => {
    expect(
      shouldOpenPr({ waiting: 10, lastPrAt: "2026-11-30T00:00:00Z", oldestApprovedAt: null, now })
    ).toBe(true);
  });

  it("otherwise waits two weeks from the last PR, or from the oldest approval", () => {
    expect(
      shouldOpenPr({ waiting: 3, lastPrAt: "2026-11-20T00:00:00Z", oldestApprovedAt: null, now })
    ).toBe(false);
    expect(
      shouldOpenPr({ waiting: 3, lastPrAt: "2026-11-15T00:00:00Z", oldestApprovedAt: null, now })
    ).toBe(true);
    expect(
      shouldOpenPr({ waiting: 1, lastPrAt: null, oldestApprovedAt: "2026-11-25T00:00:00Z", now })
    ).toBe(false);
    expect(nextPublishDue({ lastPrAt: null, oldestApprovedAt: "2026-11-25T00:00:00Z" })?.toISOString()).toBe(
      "2026-12-09T00:00:00.000Z"
    );
  });

  it("never sends an empty PR", () => {
    expect(shouldOpenPr({ waiting: 0, lastPrAt: null, oldestApprovedAt: null, now })).toBe(false);
  });
});
