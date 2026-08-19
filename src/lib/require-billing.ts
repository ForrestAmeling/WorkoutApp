import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasSubscriptionAccess } from "@/lib/subscription-access";
import { ensureTrialSubscription } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import type { Subscription } from "@/lib/types";

export async function requireBillingPage() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  let subscription: Subscription | null = null;
  try {
    subscription = await ensureTrialSubscription(user);
  } catch {
    subscription = null;
  }
  if (!subscription) {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    subscription = (data as Subscription | null) ?? null;
  }

  if (!hasSubscriptionAccess(subscription)) {
    redirect("/settings?billing=required");
  }

  return { user, supabase, subscription };
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
