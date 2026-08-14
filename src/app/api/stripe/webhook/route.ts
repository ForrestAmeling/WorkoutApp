import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  attachPaymentMethodFromSetupSession,
  syncStripeSubscription,
} from "@/lib/subscription";

async function claimStripeEvent(id: string, type: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("stripe_events").insert({ id, type });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      secret
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const claimed = await claimStripeEvent(event.id, event.type);
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "setup") {
          await attachPaymentMethodFromSetupSession(session);
          break;
        }
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subscriptionId) break;
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(
          subscription,
          session.metadata?.supabase_user_id ?? session.client_reference_id
        );
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end": {
        await syncStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId =
          typeof subRef === "string" ? subRef : subRef?.id;
        if (!subscriptionId) break;
        const subscription =
          await stripe.subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(subscription);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
