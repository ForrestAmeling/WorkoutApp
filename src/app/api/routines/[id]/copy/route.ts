import { createClient } from "@/lib/supabase/server";
import { copyRoutine } from "@/lib/routines";
import { NextResponse } from "next/server";

type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const routine = await copyRoutine(supabase, user.id, id);
    return NextResponse.json({ routine });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Copy failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
