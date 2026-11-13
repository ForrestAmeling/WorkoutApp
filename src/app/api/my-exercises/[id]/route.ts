import {
  customExerciseLibraryId,
  customToLibraryExercise,
  EXERCISE_IMAGE_BUCKET,
  exerciseImageUrl,
  getCustomExercise,
  normalizeCustomExerciseInput,
  publishProblems,
  type CustomExercise,
  type PublishStatus,
} from "@/lib/custom-exercises";
import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

async function loadOwned(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<CustomExercise | NextResponse> {
  const existing = await getCustomExercise(supabase, id);
  // Shared exercises are readable by everyone — only the creator may change them.
  if (!existing || existing.user_id !== userId) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }
  return existing;
}

async function authorize() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const denied = await billingApiError(user.id);
  if (denied) return { error: denied };
  return { supabase, user };
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  const parsed = normalizeCustomExerciseInput(body, user.id);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existing = await loadOwned(supabase, user.id, id);
    if (existing instanceof NextResponse) return existing;

    // Owners can only ask to publish or withdraw the ask; review states
    // belong to the admin (and a trigger enforces it).
    let publish_status: PublishStatus | undefined;
    if (
      body?.submit_to_free_db === true &&
      ["none", "rejected", "closed"].includes(existing.publish_status)
    ) {
      const missing = publishProblems(parsed.value);
      if (missing.length) {
        return NextResponse.json(
          { error: `To submit to free-exercise-db, add ${missing.join(", ")}.` },
          { status: 400 }
        );
      }
      publish_status = "requested";
    } else if (
      body?.submit_to_free_db === false &&
      ["requested", "approved"].includes(existing.publish_status)
    ) {
      publish_status = "none";
    }

    const { data, error } = await supabase
      .from("custom_exercises")
      .update({
        ...parsed.value,
        ...(publish_status ? { publish_status } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) throw error;
    const exercise = data as CustomExercise;

    // Routine exercises copy name/thumbnail/muscle when added — keep your
    // own routines in step with the edit (RLS limits this to your rows).
    await supabase
      .from("exercises")
      .update({
        name: exercise.name,
        image_url: exercise.images[0] ? exerciseImageUrl(exercise.images[0]) : null,
        muscle_group: exercise.primary_muscles[0] ?? null,
      })
      .eq("library_id", customExerciseLibraryId(id));

    const removed = existing.images.filter((p) => !exercise.images.includes(p));
    if (removed.length) {
      await supabase.storage.from(EXERCISE_IMAGE_BUCKET).remove(removed);
    }

    return NextResponse.json({
      exercise,
      library: customToLibraryExercise(exercise, user.id),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  try {
    const existing = await loadOwned(supabase, user.id, id);
    if (existing instanceof NextResponse) return existing;

    const { error } = await supabase
      .from("custom_exercises")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;

    // Routine slots that used it keep their name and logged history; only
    // the photo link goes, since the file is about to be deleted.
    await supabase
      .from("exercises")
      .update({ image_url: null })
      .eq("library_id", customExerciseLibraryId(id));
    if (existing.images.length) {
      await supabase.storage.from(EXERCISE_IMAGE_BUCKET).remove(existing.images);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
