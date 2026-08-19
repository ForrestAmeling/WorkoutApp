import { NextResponse } from "next/server";
import { setCancelAtPeriodEnd } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";

export async function POST() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subscription = await setCancelAtPeriodEnd(user.id, true);
    return NextResponse.json({ subscription });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not cancel subscription.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
