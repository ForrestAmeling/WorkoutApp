import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Supabase pauses a free-tier project after ~7 days without database
 * activity, which takes the whole app down and makes every Stripe webhook
 * fail. A daily read keeps the project marked active.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .select("user_id")
    .limit(1);

  if (error) {
    console.error("Supabase keep-alive query failed", {
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
