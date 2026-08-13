import { describe, expect, it } from "vitest";
import {
  findBestLibraryMatch,
  normalizeExerciseName,
  scoreNameMatch,
} from "./exercise-match";

const LIBRARY = [
  { id: "Incline_Dumbbell_Press", name: "Incline Dumbbell Press" },
  { id: "Incline_Dumbbell_Flyes", name: "Incline Dumbbell Flyes" },
  { id: "Dumbbell_Bench_Press", name: "Dumbbell Bench Press" },
  { id: "Barbell_Bench_Press", name: "Barbell Bench Press" },
  { id: "Decline_Dumbbell_Press", name: "Decline Dumbbell Press" },
];

describe("normalizeExerciseName", () => {
  it("expands gym abbreviations", () => {
    expect(normalizeExerciseName("Incline DB press")).toBe(
      "incline dumbbell press"
    );
    expect(normalizeExerciseName("BB RDL")).toBe("barbell romanian deadlift");
  });
});

describe("findBestLibraryMatch", () => {
  it("matches Incline Dumbbell Press from a short DB nickname", () => {
    expect(findBestLibraryMatch(LIBRARY, "Incline DB press")?.name).toBe(
      "Incline Dumbbell Press"
    );
  });

  it("matches a close typo like Inline DB press", () => {
    expect(findBestLibraryMatch(LIBRARY, "Inline DB press")?.name).toBe(
      "Incline Dumbbell Press"
    );
  });

  it("prefers press over flyes when the name says press", () => {
    expect(findBestLibraryMatch(LIBRARY, "incline dumbbell press")?.name).toBe(
      "Incline Dumbbell Press"
    );
  });

  it("does not match a one-word name that is too vague", () => {
    expect(findBestLibraryMatch(LIBRARY, "press")).toBeNull();
  });
});

describe("scoreNameMatch", () => {
  it("scores an expanded abbreviation as a strong hit", () => {
    expect(
      scoreNameMatch("incline db press", "Incline Dumbbell Press")
    ).toBeGreaterThan(90);
  });
});
