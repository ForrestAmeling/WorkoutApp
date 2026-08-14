"use client";

import { useEffect, useState } from "react";
import type { Subscription } from "@/lib/types";
import {
  accessEndsOn,
  hasSubscriptionAccess,
} from "@/lib/subscription-access";

type Plan = {
  name: string;
  amountLabel: string;
  intervalLabel: string;
};

function statusLabel(subscription: Subscription | null) {
  if (subscription?.cancel_at_period_end) return "Cancels at period end";
  switch (subscription?.status) {
    case "trialing":
      return "Free trial";
    case "active":
      return "Active";
    case "past_due":
      return "Payment past due";
    case "canceled":
      return "Canceled";
    case "expired":
      return "Trial ended";
    default:
      return "Not subscribed";
  }
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SubscriptionCard({
  subscription,
  plan,
  notice,
}: {
  subscription: Subscription | null;
  plan: Plan;
  notice?: "success" | "card" | "canceled" | "required" | null;
}) {
  const [current, setCurrent] = useState(subscription);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<
    "checkout" | "portal" | "cancel" | "resume" | null
  >(null);

  useEffect(() => {
    setCurrent(subscription);
  }, [subscription]);

  const subscribed = hasSubscriptionAccess(current);
  const trialing = current?.status === "trialing";
  const cancelScheduled = Boolean(current?.cancel_at_period_end);
  const trialEnd = formatDate(current?.trial_end ?? null);
  const periodEnd = formatDate(accessEndsOn(current));

  async function postJson(url: string) {
    const res = await fetch(url, { method: "POST" });
    const text = await res.text();
    let data: {
      url?: string;
      error?: string;
      subscription?: Subscription;
    } = {};
    if (text) {
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error("Request failed.");
      }
    }
    if (!res.ok) {
      throw new Error(data.error ?? "Request failed.");
    }
    return data;
  }

  async function startCheckout() {
    setError(null);
    setPending("checkout");
    try {
      const data = await postJson("/api/stripe/checkout");
      if (!data.url) throw new Error("Could not start checkout.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setPending(null);
    }
  }

  async function openPortal() {
    setError(null);
    setPending("portal");
    try {
      const data = await postJson("/api/stripe/portal");
      if (!data.url) throw new Error("Could not open billing.");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing.");
      setPending(null);
    }
  }

  async function cancelSubscription() {
    setError(null);
    setPending("cancel");
    try {
      const data = await postJson("/api/stripe/cancel");
      if (data.subscription) setCurrent(data.subscription);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setPending(null);
    }
  }

  async function resumeSubscription() {
    setError(null);
    setPending("resume");
    try {
      const data = await postJson("/api/stripe/resume");
      if (data.subscription) setCurrent(data.subscription);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resume.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Subscription
      </h2>
      <div className="rounded-xl bg-[var(--card)] p-4 ring-1 ring-[var(--stroke)]">
        <p className="text-base font-bold text-[var(--ink)]">{plan.name}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          1-month free trial when you sign up, then {plan.amountLabel}/
          {plan.intervalLabel}. Cancel anytime; access lasts through the paid
          period.
        </p>
        <p className="mt-3 text-sm font-semibold text-[var(--ink)]">
          {statusLabel(current)}
        </p>
        {trialing && !cancelScheduled && trialEnd ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Started when you created your account. Trial ends {trialEnd}. Add a
            card to keep access for {plan.amountLabel}/{plan.intervalLabel}.
          </p>
        ) : null}
        {current?.status === "active" && !cancelScheduled && periodEnd ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Renews {periodEnd}. Stripe charges the saved card automatically.
          </p>
        ) : null}
        {cancelScheduled && periodEnd ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            You keep access until {periodEnd}. You will not be charged again.
          </p>
        ) : null}
        {current?.status === "expired" ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Subscribe to keep using Reps for {plan.amountLabel}/
            {plan.intervalLabel}.
          </p>
        ) : null}
        {notice === "success" ? (
          <p className="mt-3 rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm font-semibold text-[var(--ok-fg)]">
            You&apos;re subscribed.
          </p>
        ) : null}
        {notice === "card" ? (
          <p className="mt-3 rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm font-semibold text-[var(--ok-fg)]">
            Payment method saved. You won&apos;t be charged until the trial
            ends.
          </p>
        ) : null}
        {notice === "canceled" ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Checkout canceled.</p>
        ) : null}
        {notice === "required" ? (
          <p className="mt-3 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent-text)]">
            Subscribe or add a payment method to keep using Reps.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-semibold text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div className="mt-4 space-y-2">
          {trialing && !cancelScheduled ? (
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={pending !== null}
              className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {pending === "checkout" ? "Redirecting…" : "Add payment method"}
            </button>
          ) : null}
          {subscribed && current?.stripe_customer_id ? (
            <button
              type="button"
              onClick={() => void openPortal()}
              disabled={pending !== null}
              className="min-h-12 w-full rounded-xl bg-[var(--solid)] text-sm font-bold text-[var(--on-solid)] disabled:opacity-60"
            >
              {pending === "portal" ? "Opening…" : "Manage billing"}
            </button>
          ) : null}
          {subscribed && current?.stripe_subscription_id && !cancelScheduled ? (
            <button
              type="button"
              onClick={() => void cancelSubscription()}
              disabled={pending !== null}
              className="w-full text-sm font-semibold text-[var(--muted)] disabled:opacity-50"
            >
              {pending === "cancel" ? "Canceling…" : "Cancel at period end"}
            </button>
          ) : null}
          {cancelScheduled ? (
            <button
              type="button"
              onClick={() => void resumeSubscription()}
              disabled={pending !== null}
              className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {pending === "resume" ? "Resuming…" : "Keep my subscription"}
            </button>
          ) : null}
          {!subscribed ? (
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={pending !== null}
              className="min-h-12 w-full rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {pending === "checkout"
                ? "Redirecting…"
                : `Subscribe · ${plan.amountLabel}/${plan.intervalLabel}`}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
