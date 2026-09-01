import Link from "next/link";
import { notFound } from "next/navigation";
import { HistorySetRow } from "@/components/HistorySetRow";
import { requireBillingPage } from "@/lib/require-billing";
import { formatHumanDate, WEEK_LABELS } from "@/lib/program";
import type { WeekFocus } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const { user, supabase } = await requireBillingPage();

  const { data: session } = await supabase
    .from("sessions")
    .select("*, set_logs(*, exercises(name))")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!session) notFound();

  type LogRow = {
    id: string;
    set_number: number;
    weight: number | null;
    reps: number | null;
    ai_suggested_weight: number | null;
    notes: string | null;
    skipped: boolean;
    created_at?: string;
    exercises: { name: string } | null;
  };

  const logs = ((session.set_logs ?? []) as LogRow[]).slice().sort((a, b) => {
    const aTime = a.created_at ?? "";
    const bTime = b.created_at ?? "";
    if (aTime !== bTime) return aTime.localeCompare(bTime);
    return a.set_number - b.set_number;
  });

  const byExercise = new Map<string, LogRow[]>();
  for (const row of logs) {
    const name = row.exercises?.name ?? "Exercise";
    const list = byExercise.get(name) ?? [];
    list.push(row);
    byExercise.set(name, list);
  }

  return (
    <>
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
                <HistorySetRow key={r.id} row={r} />
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
    </>
  );
}
