import {
  getLibraryExercise,
  loadExerciseLibrary,
  searchExerciseLibrary,
  uniqueEquipment,
  uniqueMuscles,
} from "@/lib/exercise-library";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? undefined;
  const name = searchParams.get("name") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const muscle = searchParams.get("muscle") ?? undefined;
  const equipment = searchParams.get("equipment") ?? undefined;
  const meta = searchParams.get("meta") === "1";
  const limit = Number(searchParams.get("limit") ?? "40");

  try {
    if (id || name) {
      const exercise = await getLibraryExercise({ id, name });
      if (!exercise) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ exercise });
    }

    if (meta) {
      const all = await loadExerciseLibrary();
      return NextResponse.json({
        muscles: uniqueMuscles(all),
        equipment: uniqueEquipment(all),
        count: all.length,
      });
    }

    const results = await searchExerciseLibrary({
      q,
      muscle,
      equipment,
      limit: Number.isFinite(limit) ? limit : 40,
    });
    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Library load failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
