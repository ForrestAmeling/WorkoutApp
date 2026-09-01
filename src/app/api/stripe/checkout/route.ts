import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import {
  appUrl,
  getStripe,
  getStripePriceId,
  isMissingCustomerError,
  stripeErrorMessage,
} from "@/lib/stripe";
import { hasSubscriptionAccess } from "@/lib/subscription-access";
import { reprovisionStripeCustomer } from "@/lib/subscription";
import type { VerifiedUser } from "@/lib/supabase/verified-user";

function checkoutError(error: unknown) {
  return NextResponse.json(
    { error: stripeErrorMessage(error, "Could not start checkout.") },
    { status: 500 }
  );
}

type ExistingSubscription = {
  status: string;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  trial_end: string | null;
} | null;

async function loadExisting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ExistingSubscription> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, stripe_customer_id, current_period_end, trial_end")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function attemptCheckout(
  request: Request,
  user: VerifiedUser,
  existing: ExistingSubscription
) {
  const origin = appUrl(request);
  const stripe = getStripe();
  const managedPayments = { enabled: false as const };

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
    customer_email: existing?.stripe_customer_id
      ? undefined
      : user.email ?? undefined,
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
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await loadExisting(supabase, user.id);

  if (existing?.status === "active" || existing?.status === "past_due") {
    return NextResponse.json(
      { error: "You already have an active subscription." },
      { status: 409 }
    );
  }

  try {
    return await attemptCheckout(request, user, existing);
  } catch (error) {
    // Stale stripe_customer_id from before Stripe was fully wired up (or
    // an account swap) — re-provision a fresh customer/trial against the
    // currently-connected Stripe account and retry once.
    if (!isMissingCustomerError(error)) {
      return checkoutError(error);
    }
    try {
      await reprovisionStripeCustomer(user);
      const refreshed = await loadExisting(supabase, user.id);
      return await attemptCheckout(request, user, refreshed);
    } catch (retryError) {
      return checkoutError(retryError);
    }
  }
}
