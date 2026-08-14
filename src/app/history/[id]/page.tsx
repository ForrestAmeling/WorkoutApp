import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { WeightText } from "@/components/WeightText";
import { requireBillingPage } from "@/lib/require-billing";
import { billingNotice } from "@/lib/subscription-access";
import { formatHumanDate, WEEK_LABELS } from "@/lib/program";
import type { WeekFocus } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const { user, supabase, subscription } = await requireBillingPage();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!session) notFound();

  const { data: logs } = await supabase
    .from("set_logs")
    .select("*, exercises(name)")
    .eq("session_id", id)
    .order("created_at");

  type LogRow = {
    id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    ai_suggested_weight: number | null;
    notes: string | null;
    exercises: { name: string } | null;
  };

  const byExercise = new Map<string, LogRow[]>();
  for (const row of (logs ?? []) as LogRow[]) {
    const name = row.exercises?.name ?? "Exercise";
    const list = byExercise.get(name) ?? [];
    list.push(row);
    byExercise.set(name, list);
  }

  return (
    <AppShell
      billingNotice={billingNotice(subscription)}
      trialEnd={subscription?.trial_end}
    >
      <Link
        href="/history"
        className="text-sm font-semibold text-[var(--muted)]"
      >
        ← History
      </Link>
      <header className="mt-3 mb-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          {WEEK_LABELS[session.week_focus as WeekFocus]} · Day{" "}
          {session.day_number}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {formatHumanDate(session.performed_on)}
        </p>
      </header>

      <div className="space-y-3">
        {[...byExercise.entries()].map(([name, rows]) => (
          <section
            key={name}
            className="rounded-2xl bg-[var(--card)] px-4 py-3 ring-1 ring-[var(--stroke)]"
          >
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink)]">
              {name}
            </h2>
            <ul className="mt-2 space-y-1">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex justify-between text-sm text-[var(--ink)]"
                >
                  <span className="text-[var(--muted)]">
                    Set {r.set_number}
                  </span>
                    <span className="tabular-nums font-semibold">
                      <WeightText lb={r.weight} /> × {r.reps}
                      {r.ai_suggested_weight != null && (
                        <span className="ml-2 font-normal text-[var(--muted)]">
                          (AI <WeightText lb={r.ai_suggested_weight} />)
                        </span>
                      )}
                    {r.notes ? (
                      <span className="ml-2 font-normal text-[var(--muted)]">
                        · {r.notes}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {byExercise.size === 0 && (
          <p className="rounded-2xl bg-[var(--card)] px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-[var(--stroke)]">
            No sets logged in this session.
          </p>
        )}
      </div>
    </AppShell>
  );
}
