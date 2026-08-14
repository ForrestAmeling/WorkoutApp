import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { parsePeriodizationMode } from "@/lib/periodization";
import { createRoutineFromDays, listRoutines } from "@/lib/routines";
import type { RoutineDayInput, RoutineSource } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;
  const routines = await listRoutines(supabase, user.id);
  return NextResponse.json({ routines });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const days = body.days as RoutineDayInput[] | undefined;
  const source = (body.source ?? "manual") as RoutineSource;
  const periodization_mode =
    parsePeriodizationMode(body.periodization_mode) ??
    (body.uses_periodization ? "full" : "none");
  const description =
    body.description != null ? String(body.description) : undefined;

  if (!name || !days?.length) {
    return NextResponse.json(
      { error: "name and days are required" },
      { status: 400 }
    );
  }

  try {
    const routine = await createRoutineFromDays(supabase, user.id, {
      name,
      description,
      source,
      periodization_mode,
      days,
      makeActive: body.make_active !== false,
    });
    return NextResponse.json({ routine });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
