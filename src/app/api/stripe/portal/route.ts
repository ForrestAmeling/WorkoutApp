import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getPortalConfigurationId, getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account yet." },
      { status: 400 }
    );
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: existing.stripe_customer_id,
    configuration: await getPortalConfigurationId(),
    return_url: `${appUrl(request)}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
