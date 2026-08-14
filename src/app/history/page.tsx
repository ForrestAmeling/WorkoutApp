import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { requireBillingPage } from "@/lib/require-billing";
import { billingNotice } from "@/lib/subscription-access";
import { formatHumanDate, WEEK_LABELS } from "@/lib/program";
import type { WeekFocus } from "@/lib/types";

export default async function HistoryPage() {
  const { user, supabase, subscription } = await requireBillingPage();

  const { data: sessions } = await supabase
    .from("sessions")
    .select(
      "id, performed_on, week_focus, day_number, created_at, routines(name, uses_periodization, periodization_mode), set_logs!inner(id)"
    )
    .eq("user_id", user.id)
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(40);

  const rows = (sessions ?? []).map((s) => {
    const routineRel = s.routines as
      | {
          name: string;
          uses_periodization: boolean;
          periodization_mode?: string;
        }
      | {
          name: string;
          uses_periodization: boolean;
          periodization_mode?: string;
        }[]
      | null;
    const routine = Array.isArray(routineRel)
      ? routineRel[0] ?? null
      : routineRel;
    return {
      id: s.id as string,
      performed_on: s.performed_on as string,
      week_focus: s.week_focus as WeekFocus,
      day_number: s.day_number as number,
      routine,
    };
  });

  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return (
    <AppShell
      billingNotice={billingNotice(subscription)}
      trialEnd={subscription?.trial_end}
    >
      <header className="mb-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          History
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sessions where you logged at least one set
        </p>
      </header>

      <ul className="space-y-2">
        {unique.map((s) => (
          <li key={s.id}>
            <Link
              href={`/history/${s.id}`}
              className="flex min-h-16 items-center justify-between rounded-2xl bg-[var(--card)] px-4 py-3 ring-1 ring-[var(--stroke)] transition active:scale-[0.99]"
            >
              <div>
                <p className="font-semibold text-[var(--ink)]">
                  {s.routine?.uses_periodization
                    ? `${WEEK_LABELS[s.week_focus]} · Day ${s.day_number}`
                    : `Day ${s.day_number}`}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {s.routine?.name ? `${s.routine.name} · ` : ""}
                  {formatHumanDate(s.performed_on)}
                </p>
              </div>
              <span className="text-lg text-[var(--muted)]">›</span>
            </Link>
          </li>
        ))}
        {unique.length === 0 && (
          <li className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
            No logged workouts yet. Save a set from Today and it will show up
            here.
          </li>
        )}
      </ul>
    </AppShell>
  );
}
