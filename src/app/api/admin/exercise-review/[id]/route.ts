import { isAppAdmin } from "@/lib/app-admin";
import {
  getCustomExercise,
  publishProblems,
} from "@/lib/custom-exercises";
import { loadExerciseLibrary } from "@/lib/exercise-library";
import { freeDbId } from "@/lib/exercise-publishing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

/**
 * Approve or decline a free-exercise-db request. Owners can't set these
 * states themselves (a trigger blocks it), so the change is written with
 * the service role after checking the caller is an app admin.
 */
export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user || !(await isAppAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
  };
  if (body.action !== "approve" && body.action !== "decline") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null;

  const exercise = await getCustomExercise(supabase, id);
  if (!exercise || exercise.publish_status !== "requested") {
    return NextResponse.json(
      { error: "This exercise isn't waiting for review anymore." },
      { status: 409 }
    );
  }

  if (body.action === "approve") {
    const missing = publishProblems(exercise);
    if (missing.length) {
      return NextResponse.json(
        { error: `Can't approve yet — it still needs ${missing.join(", ")}.` },
        { status: 400 }
      );
    }
    const slug = freeDbId(exercise.name).toLowerCase();
    const library = await loadExerciseLibrary().catch(() => []);
    if (library.some((e) => e.id.toLowerCase() === slug)) {
      return NextResponse.json(
        {
          error:
            "free-exercise-db already has an exercise with this name. Decline it with a note asking for a different name.",
        },
        { status: 400 }
      );
    }
  }

  const { error } = await createAdminClient()
    .from("custom_exercises")
    .update({
      publish_status: body.action === "approve" ? "approved" : "rejected",
      publish_reviewed_at: new Date().toISOString(),
      publish_note: body.action === "decline" ? note : null,
    })
    .eq("id", id)
    .eq("publish_status", "requested");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
