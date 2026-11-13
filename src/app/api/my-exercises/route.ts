import {
  customToLibraryExercise,
  normalizeCustomExerciseInput,
  type CustomExercise,
} from "@/lib/custom-exercises";
import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

  const parsed = normalizeCustomExerciseInput(
    await request.json().catch(() => null),
    user.id
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("custom_exercises")
    .insert({ ...parsed.value, user_id: user.id })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const exercise = data as CustomExercise;
  return NextResponse.json({
    exercise,
    library: customToLibraryExercise(exercise, user.id),
  });
}
