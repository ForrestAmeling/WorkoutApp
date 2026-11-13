import { describe, expect, it } from "vitest";
import {
  customIdFromLibraryId,
  customToLibraryExercise,
  exerciseImageUrl,
  filterCustomExercises,
  isPrivateExerciseImage,
  normalizeCustomExerciseInput,
  splitInstructions,
  type CustomExercise,
} from "./custom-exercises";

const OWNER = "11111111-1111-1111-1111-111111111111";

function row(over: Partial<CustomExercise> = {}): CustomExercise {
  return {
    id: "abc",
    user_id: OWNER,
    name: "Cable Hip Thrust",
    visibility: "private",
    equipment: "cable",
    level: null,
    force: null,
    mechanic: null,
    category: null,
    primary_muscles: ["glutes"],
    secondary_muscles: ["hamstrings"],
    instructions: ["Step one."],
    images: [`${OWNER}/a.jpg`],
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("splitInstructions", () => {
  it("splits lines and strips list markers", () => {
    expect(splitInstructions("1. Stand tall\n2) Brace\n\n- Push\n• Return")).toEqual([
      "Stand tall",
      "Brace",
      "Push",
      "Return",
    ]);
  });
});

describe("normalizeCustomExerciseInput", () => {
  it("requires a name", () => {
    expect(normalizeCustomExerciseInput({ name: "  " }, OWNER).ok).toBe(false);
  });

  it("cleans fields and drops values outside the free-exercise-db vocab", () => {
    const res = normalizeCustomExerciseInput(
      {
        name: "  Landmine   Press ",
        visibility: "shared",
        equipment: "Barbell",
        level: "godlike",
        force: "push",
        primary_muscles: ["Shoulders", "shoulders", "triceps"],
        secondary_muscles: ["triceps", "chest"],
        instructions: "1. Kneel\n2. Press",
        images: [`${OWNER}/x.jpg`],
      },
      OWNER
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      name: "Landmine Press",
      visibility: "shared",
      equipment: "barbell",
      level: null,
      force: "push",
      primary_muscles: ["shoulders", "triceps"],
      secondary_muscles: ["chest"],
      instructions: ["Kneel", "Press"],
      images: [`${OWNER}/x.jpg`],
    });
  });

  it("defaults to private and rejects photos outside the owner's folder", () => {
    const ok = normalizeCustomExerciseInput({ name: "A" }, OWNER);
    expect(ok.ok && ok.value.visibility).toBe("private");
    for (const bad of ["someone-else/x.jpg", `${OWNER}/../x.jpg`, `${OWNER}/x.gif`]) {
      expect(normalizeCustomExerciseInput({ name: "A", images: [bad] }, OWNER).ok).toBe(false);
    }
  });
});

describe("library linking", () => {
  it("round-trips the user: library id and serves photos via the private route", () => {
    const lib = customToLibraryExercise(row(), OWNER);
    expect(lib.id).toBe("user:abc");
    expect(customIdFromLibraryId(lib.id)).toBe("abc");
    expect(customIdFromLibraryId("Barbell_Squat")).toBeNull();
    expect(lib.imageUrl).toBe(exerciseImageUrl(`${OWNER}/a.jpg`));
    expect(isPrivateExerciseImage(lib.imageUrl)).toBe(true);
    expect(lib.source).toBe("mine");
    expect(customToLibraryExercise(row(), "someone-else").source).toBe("shared");
  });
});

describe("filterCustomExercises", () => {
  const mine = customToLibraryExercise(row({ id: "1", name: "Zercher Hip Thrust" }), OWNER);
  const shared = customToLibraryExercise(
    row({ id: "2", name: "Banded Hip Thrust", user_id: "other", equipment: "bands" }),
    OWNER
  );

  it("puts your own exercises first", () => {
    expect(filterCustomExercises([shared, mine], {}).map((e) => e.id)).toEqual([
      "user:1",
      "user:2",
    ]);
    expect(filterCustomExercises([shared, mine], { q: "hip thrust" })[0].id).toBe("user:1");
  });

  it("applies muscle, equipment and name filters", () => {
    expect(filterCustomExercises([shared, mine], { equipment: "bands" })).toEqual([shared]);
    expect(filterCustomExercises([shared, mine], { muscle: "biceps" })).toEqual([]);
    expect(filterCustomExercises([shared, mine], { q: "deadlift" })).toEqual([]);
  });
});
