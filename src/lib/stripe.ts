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

function firstHeader(request: Request, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function isLocalHost(hostname: string) {
  const host = hostname.startsWith("[")
    ? hostname.slice(1, hostname.indexOf("]"))
    : hostname.split(":")[0];
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Stripe Checkout/Portal only accept absolute http(s) URLs, and live mode
 * rejects anything that isn't https except localhost. NEXT_PUBLIC_APP_URL
 * is often unset or missing a scheme on Vercel, and request.url can be an
 * internal origin (http://localhost, 0.0.0.0) — both produce Stripe's
 * "Not a valid URL" error.
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let value = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.hostname === "0.0.0.0") return null;
    if (!isLocalHost(url.hostname) && url.protocol === "http:") {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function appUrl(
  request: Request,
  env: NodeJS.Dict<string | undefined> = process.env
) {
  const host =
    firstHeader(request, "x-forwarded-host") ?? firstHeader(request, "host");
  const proto = firstHeader(request, "x-forwarded-proto");
  const headerOrigin = host
    ? `${proto === "http" && isLocalHost(host) ? "http" : proto || "https"}://${host}`
    : null;

  let requestOrigin: string | null = null;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    requestOrigin = null;
  }

  const vercelProd = env.VERCEL_PROJECT_PRODUCTION_URL;
  const vercelUrl = env.VERCEL_URL;

  const origin =
    normalizeOrigin(env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(headerOrigin) ??
    normalizeOrigin(vercelProd) ??
    normalizeOrigin(requestOrigin) ??
    normalizeOrigin(vercelUrl);

  if (!origin) {
    throw new Error(
      "Could not determine a public https URL for Stripe. Set NEXT_PUBLIC_APP_URL to your live site, e.g. https://repsapp.fit"
    );
  }
  return origin;
}

export function stripeErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

let portalConfigId: string | null = null;

const portalFeatures = {
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

export async function getPortalConfigurationId() {
  if (portalConfigId) return portalConfigId;

  const stripe = getStripe();
  const fromEnv = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  if (fromEnv) {
    try {
      await stripe.billingPortal.configurations.retrieve(fromEnv);
      portalConfigId = fromEnv;
      return fromEnv;
    } catch {
      // Test/live mismatch or a deleted config — fall through.
    }
  }

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
    features: portalFeatures,
  });
  portalConfigId = created.id;
  return created.id;
}
