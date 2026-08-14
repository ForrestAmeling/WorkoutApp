import Stripe from "stripe";

export const TRIAL_PERIOD_DAYS = 30;

export function trialEndUnixFromSignup(createdAt: string) {
  return (
    Math.floor(new Date(createdAt).getTime() / 1000) +
    TRIAL_PERIOD_DAYS * 24 * 60 * 60
  );
}

let stripe: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  stripe ??= new Stripe(key);
  return stripe;
}

export function getStripePriceId() {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) {
    throw new Error("STRIPE_PRICE_ID is not set");
  }
  return id;
}

export function appUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

export function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

let portalConfigId: string | null = process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? null;

export async function getPortalConfigurationId() {
  if (portalConfigId) return portalConfigId;
  const fromEnv = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) {
    portalConfigId = fromEnv;
    return fromEnv;
  }

  const stripe = getStripe();
  const features = {
    customer_update: {
      enabled: true,
      allowed_updates: ["email", "name"] as Array<"email" | "name">,
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end" as const,
      proration_behavior: "none" as const,
    },
    subscription_update: { enabled: false },
  };

  const list = await stripe.billingPortal.configurations.list({
    limit: 20,
    active: true,
  });
  const existing = list.data.find(
    (config) => config.features.subscription_cancel.mode === "at_period_end"
  );
  if (existing) {
    portalConfigId = existing.id;
    return existing.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Reps subscription" },
    features,
  });
  portalConfigId = created.id;
  return created.id;
}
