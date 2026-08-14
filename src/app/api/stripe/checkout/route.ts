import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, getStripe, getStripePriceId } from "@/lib/stripe";
import { hasSubscriptionAccess } from "@/lib/subscription-access";

function checkoutError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Could not start checkout.";
  return NextResponse.json({ error: message }, { status: 500 });
}

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
    .select("status, stripe_customer_id, current_period_end, trial_end")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.status === "active" || existing?.status === "past_due") {
    return NextResponse.json(
      { error: "You already have an active subscription." },
      { status: 409 }
    );
  }

  const origin = appUrl(request);
  const stripe = getStripe();
  const managedPayments = { enabled: false as const };

  try {
    if (existing?.status === "trialing" && existing.stripe_customer_id) {
      const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: existing.stripe_customer_id,
        currency: "usd",
        managed_payments: managedPayments,
        client_reference_id: user.id,
        success_url: `${origin}/settings?checkout=card&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/settings?checkout=canceled`,
        metadata: { supabase_user_id: user.id },
      });
      if (!session.url) {
        return NextResponse.json(
          { error: "Could not start checkout." },
          { status: 500 }
        );
      }
      return NextResponse.json({ url: session.url });
    }

    if (!existing?.stripe_customer_id && !user.email) {
      return NextResponse.json(
        { error: "Your account needs an email to start checkout." },
        { status: 400 }
      );
    }

    if (hasSubscriptionAccess(existing) && existing?.status !== "trialing") {
      return NextResponse.json(
        { error: "You already have an active subscription." },
        { status: 409 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      managed_payments: managedPayments,
      client_reference_id: user.id,
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      line_items: [{ price: getStripePriceId(), quantity: 1 }],
      success_url: `${origin}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings?checkout=canceled`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return checkoutError(error);
  }
}
