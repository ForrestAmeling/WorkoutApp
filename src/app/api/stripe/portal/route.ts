import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import {
  appUrl,
  getPortalConfigurationId,
  getStripe,
  isMissingCustomerError,
  stripeErrorMessage,
} from "@/lib/stripe";
import { reprovisionStripeCustomer } from "@/lib/subscription";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
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

  const openPortal = async (customerId: string) =>
    getStripe().billingPortal.sessions.create({
      customer: customerId,
      configuration: await getPortalConfigurationId(),
      return_url: `${appUrl(request)}/settings`,
    });

  try {
    const session = await openPortal(existing.stripe_customer_id);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (!isMissingCustomerError(error)) {
      return NextResponse.json(
        { error: stripeErrorMessage(error, "Could not open billing.") },
        { status: 500 }
      );
    }
    // Stale stripe_customer_id from before Stripe was fully wired up (or
    // an account swap) — re-provision against the current Stripe account
    // and retry once.
    try {
      const reprovisioned = await reprovisionStripeCustomer(user);
      if (!reprovisioned?.stripe_customer_id) {
        throw new Error("Could not re-provision billing account.");
      }
      const session = await openPortal(reprovisioned.stripe_customer_id);
      return NextResponse.json({ url: session.url });
    } catch (retryError) {
      return NextResponse.json(
        { error: stripeErrorMessage(retryError, "Could not open billing.") },
        { status: 500 }
      );
    }
  }
}
