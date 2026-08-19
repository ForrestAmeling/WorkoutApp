import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SettingsForm } from "@/components/SettingsForm";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { formatUsdFromCents, getStripe, getStripePriceId } from "@/lib/stripe";
import {
  attachPaymentMethodFromSetupSession,
  ensureTrialSubscription,
  syncStripeSubscription,
} from "@/lib/subscription";
import { billingNotice } from "@/lib/subscription-access";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import type { Subscription } from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  try {
    await ensureTrialSubscription(user);
  } catch {
    // Billing should not block settings.
  }

  const params = await searchParams;
  const checkout = firstParam(params.checkout);
  const sessionId = firstParam(params.session_id);
  const billing = firstParam(params.billing);

  if (sessionId && (checkout === "success" || checkout === "card")) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      const belongsToUser =
        session.client_reference_id === user.id ||
        session.metadata?.supabase_user_id === user.id;
      if (belongsToUser && session.mode === "setup") {
        await attachPaymentMethodFromSetupSession(session);
      }
      const subscription = session.subscription;
      if (
        belongsToUser &&
        subscription &&
        typeof subscription !== "string"
      ) {
        await syncStripeSubscription(subscription, user.id);
      }
    } catch {
      // Webhook can still sync; the card just may lag for a moment.
    }
  }

  const [{ data }, plan] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    loadPlan(),
  ]);

  return (
    <AppShell
      billingNotice={billingNotice(data as Subscription | null)}
      trialEnd={(data as Subscription | null)?.trial_end}
    >
      <header className="mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Billing, units, rest timer, appearance, and sign out
        </p>
      </header>
      <div className="space-y-6">
        <SubscriptionCard
          subscription={(data as Subscription | null) ?? null}
          plan={plan}
          notice={
            checkout === "success"
              ? "success"
              : checkout === "card"
                ? "card"
                : checkout === "canceled"
                  ? "canceled"
                  : billing === "required"
                    ? "required"
                    : null
          }
        />
        <SettingsForm />
      </div>
    </AppShell>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadPlan() {
  try {
    const price = await getStripe().prices.retrieve(getStripePriceId(), {
      expand: ["product"],
    });
    const product = price.product;
    const name =
      product && typeof product !== "string" && "name" in product
        ? product.name
        : "Reps Annual Subscription";
    return {
      name,
      amountLabel: formatUsdFromCents(price.unit_amount ?? 0),
      intervalLabel: price.recurring?.interval === "year" ? "year" : "month",
    };
  } catch {
    return {
      name: "Reps Annual Subscription",
      amountLabel: "$12",
      intervalLabel: "year",
    };
  }
}
