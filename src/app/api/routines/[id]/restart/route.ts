import { billingApiError } from "@/lib/require-billing";
import { isISODate } from "@/lib/program";
import { getRoutine, setActiveRoutine } from "@/lib/routines";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { closeOpenRun } from "@/lib/workout";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

/**
 * Close the routine's current run so Today starts it over from the first
 * day. `activate: true` also makes it the active routine (Restart);
 * without it the run is just closed. `today` is the client's local date,
 * since the server's clock may already be on tomorrow (UTC).
 */
export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    activate?: unknown;
    today?: unknown;
  };

  try {
    const routine = await getRoutine(supabase, id);
    if (!routine || routine.user_id !== user.id) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 });
    }
    await closeOpenRun(
      supabase,
      user.id,
      id,
      typeof body.today === "string" && isISODate(body.today)
        ? body.today
        : undefined
    );
    if (body.activate === true && !routine.is_active) {
      await setActiveRoutine(supabase, user.id, id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Restart failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
