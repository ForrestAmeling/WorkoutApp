import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasSubscriptionAccess } from "@/lib/subscription-access";
import { ensureTrialSubscription } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import type { Subscription } from "@/lib/types";

function needsStripeBootstrap(subscription: Subscription | null) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return false;
  }
  // Existing Stripe-backed rows are already the source of truth — skip the
  // Stripe API on every page load. Only bootstrap when we have never
  // created a subscription (or it's still waiting on a Stripe id).
  if (subscription?.stripe_subscription_id) return false;
  if (subscription?.status === "expired") return false;
  return true;
}

/**
 * Shared per-request auth + subscription load. Layout and pages call this
 * (or requireBillingPage) so they don't each pay for their own round trips.
 */
export const getAppContext = cache(async () => {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  let subscription = (data as Subscription | null) ?? null;

  if (needsStripeBootstrap(subscription)) {
    try {
      subscription = (await ensureTrialSubscription(user)) ?? subscription;
    } catch {
      // Keep the local row; settings can still retry Stripe.
    }
  }

  return { user, supabase, subscription };
});

export async function requireBillingPage() {
  const ctx = await getAppContext();
  if (!hasSubscriptionAccess(ctx.subscription)) {
    redirect("/settings?billing=required");
  }
  return ctx;
}

export async function billingApiError(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, trial_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (hasSubscriptionAccess(data)) return null;
  return NextResponse.json(
    { error: "Subscription required" },
    { status: 402 }
  );
}
