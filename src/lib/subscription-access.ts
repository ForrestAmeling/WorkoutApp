const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"]);
const TRIAL_ENDING_MS = 3 * 24 * 60 * 60 * 1000;

type AccessFields = {
  status?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
} | null | undefined;

function periodStillOpen(iso: string | null | undefined) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export function hasSubscriptionAccess(subscription: AccessFields) {
  const status = subscription?.status ?? "";
  if (ACCESS_STATUSES.has(status)) return true;
  if (status === "canceled") {
    return (
      periodStillOpen(subscription?.current_period_end) ||
      periodStillOpen(subscription?.trial_end)
    );
  }
  return false;
}

export function accessEndsOn(subscription: AccessFields) {
  return subscription?.current_period_end ?? subscription?.trial_end ?? null;
}

export function isTrialEndingSoon(subscription: AccessFields) {
  if (subscription?.status !== "trialing" || !subscription.trial_end) {
    return false;
  }
  const remaining = new Date(subscription.trial_end).getTime() - Date.now();
  return remaining > 0 && remaining <= TRIAL_ENDING_MS;
}

export type BillingNotice = "past_due" | "trial_ending" | null;

export function billingNotice(subscription: AccessFields): BillingNotice {
  if (subscription?.status === "past_due") return "past_due";
  if (isTrialEndingSoon(subscription)) return "trial_ending";
  return null;
}
