import { describe, expect, it } from "vitest";
import { trialEndUnixFromSignup, TRIAL_PERIOD_DAYS } from "./stripe";
import {
  billingNotice,
  hasSubscriptionAccess,
  isTrialEndingSoon,
} from "./subscription-access";

describe("trialEndUnixFromSignup", () => {
  it("is 30 days after account creation", () => {
    const created = "2026-01-01T00:00:00.000Z";
    const expected =
      Math.floor(Date.parse(created) / 1000) + TRIAL_PERIOD_DAYS * 24 * 60 * 60;
    expect(trialEndUnixFromSignup(created)).toBe(expected);
  });
});

describe("hasSubscriptionAccess", () => {
  it("allows trialing, active, and past_due", () => {
    expect(hasSubscriptionAccess({ status: "trialing" })).toBe(true);
    expect(hasSubscriptionAccess({ status: "active" })).toBe(true);
    expect(hasSubscriptionAccess({ status: "past_due" })).toBe(true);
  });

  it("denies expired, pending, and missing rows", () => {
    expect(hasSubscriptionAccess({ status: "expired" })).toBe(false);
    expect(hasSubscriptionAccess({ status: "pending" })).toBe(false);
    expect(hasSubscriptionAccess(null)).toBe(false);
  });

  it("keeps access after cancel until the paid period ends", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      hasSubscriptionAccess({
        status: "canceled",
        current_period_end: future,
      })
    ).toBe(true);
    expect(
      hasSubscriptionAccess({
        status: "canceled",
        trial_end: future,
      })
    ).toBe(true);
    expect(
      hasSubscriptionAccess({
        status: "canceled",
        current_period_end: past,
      })
    ).toBe(false);
  });
});

describe("billingNotice", () => {
  it("flags past_due and a trial ending within 3 days", () => {
    expect(billingNotice({ status: "past_due" })).toBe("past_due");
    const soon = new Date(Date.now() + 2 * 86400000).toISOString();
    const later = new Date(Date.now() + 10 * 86400000).toISOString();
    expect(isTrialEndingSoon({ status: "trialing", trial_end: soon })).toBe(
      true
    );
    expect(billingNotice({ status: "trialing", trial_end: soon })).toBe(
      "trial_ending"
    );
    expect(billingNotice({ status: "trialing", trial_end: later })).toBe(null);
  });
});
