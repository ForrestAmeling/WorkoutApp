import { AppShell } from "@/components/AppShell";
import { getAppContext } from "@/lib/require-billing";
import { billingNotice } from "@/lib/subscription-access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { subscription } = await getAppContext();

  return (
    <AppShell
      billingNotice={billingNotice(subscription)}
      trialEnd={subscription?.trial_end}
    >
      {children}
    </AppShell>
  );
}
