import { billingApiError } from "@/lib/require-billing";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { copyRoutine } from "@/lib/routines";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await billingApiError(user.id);
  if (denied) return denied;

  try {
    const routine = await copyRoutine(supabase, user.id, id);
    return NextResponse.json({ routine });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Copy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
