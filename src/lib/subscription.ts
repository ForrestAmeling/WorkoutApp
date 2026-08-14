import type Stripe from "stripe";
import { getStripe, getStripePriceId, trialEndUnixFromSignup } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Subscription } from "@/lib/types";

type AuthUser = {
  id: string;
  email?: string | null;
  created_at: string;
};

function unixToIso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function stripeId(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function subscriptionFromStripe(
  userId: string,
  stripeSubscription: Stripe.Subscription
): Subscription {
  const item = stripeSubscription.items.data[0];
  return {
    user_id: userId,
    stripe_customer_id: stripeId(stripeSubscription.customer),
    stripe_subscription_id: stripeSubscription.id,
    status: stripeSubscription.status,
    price_id: stripeId(item?.price),
    current_period_end: unixToIso(item?.current_period_end),
    trial_end: unixToIso(stripeSubscription.trial_end),
    cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertSubscription(row: Subscription) {
  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert(row, {
    onConflict: "user_id",
  });
  if (error) throw error;
}

export async function findUserIdForCustomer(customerId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

export async function syncStripeSubscription(
  stripeSubscription: Stripe.Subscription,
  fallbackUserId?: string | null
) {
  const customerId = stripeId(stripeSubscription.customer);
  const userId =
    stripeSubscription.metadata.supabase_user_id ||
    fallbackUserId ||
    (customerId ? await findUserIdForCustomer(customerId) : null);
  if (!userId) return null;
  const row = subscriptionFromStripe(userId, stripeSubscription);
  await upsertSubscription(row);
  return row;
}

export async function ensureTrialSubscription(user: AuthUser) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return null;
  }

  const admin = createAdminClient();
  const trialEnd = trialEndUnixFromSignup(user.created_at);
  const now = Math.floor(Date.now() / 1000);
  const trialEndIso = new Date(trialEnd * 1000).toISOString();

  const { data: existing, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  let row = (existing as Subscription | null) ?? null;
  if (row?.stripe_subscription_id) return row;

  if (trialEnd <= now + 60) {
    const expired: Subscription = {
      user_id: user.id,
      stripe_customer_id: row?.stripe_customer_id ?? null,
      stripe_subscription_id: null,
      status: "expired",
      price_id: null,
      current_period_end: null,
      trial_end: trialEndIso,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    };
    await upsertSubscription(expired);
    return expired;
  }

  if (!row) {
    const pending: Subscription = {
      user_id: user.id,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      status: "pending",
      price_id: null,
      current_period_end: null,
      trial_end: trialEndIso,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    };
    const { error: insertError } = await admin
      .from("subscriptions")
      .insert(pending);
    if (insertError && insertError.code !== "23505") throw insertError;
    const { data: again } = await admin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    row = (again as Subscription | null) ?? pending;
    if (row.stripe_subscription_id) return row;
  }

  const stripe = getStripe();
  let customerId = row.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      },
      { idempotencyKey: `reps-customer-${user.id}` }
    );
    customerId = customer.id;
    await upsertSubscription({
      ...row,
      stripe_customer_id: customerId,
      status: "pending",
      updated_at: new Date().toISOString(),
    });
  } else {
    const existingSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const open = existingSubs.data.find(
      (sub) => sub.status === "trialing" || sub.status === "active"
    );
    if (open) {
      return (await syncStripeSubscription(open, user.id)) ?? null;
    }
  }

  const subscription = await stripe.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: getStripePriceId() }],
      trial_end: trialEnd,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
      metadata: { supabase_user_id: user.id },
    },
    { idempotencyKey: `reps-trial-${user.id}` }
  );

  return (await syncStripeSubscription(subscription, user.id)) ?? null;
}

export async function setCancelAtPeriodEnd(
  userId: string,
  cancelAtPeriodEnd: boolean
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.stripe_subscription_id) {
    throw new Error("No subscription to update.");
  }

  const subscription = await getStripe().subscriptions.update(
    data.stripe_subscription_id,
    { cancel_at_period_end: cancelAtPeriodEnd }
  );
  return syncStripeSubscription(subscription, userId);
}

export async function attachPaymentMethodFromSetupSession(
  session: Stripe.Checkout.Session
) {
  if (session.mode !== "setup") return;
  const stripe = getStripe();
  const setupIntentId = stripeId(session.setup_intent);
  const customerId = stripeId(session.customer);
  if (!setupIntentId || !customerId) return;

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = stripeId(setupIntent.payment_method);
  if (!paymentMethodId) return;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (data?.stripe_subscription_id) {
    await stripe.subscriptions.update(data.stripe_subscription_id, {
      default_payment_method: paymentMethodId,
    });
  }
}
