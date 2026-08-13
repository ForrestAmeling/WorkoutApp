import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { createClient } from "@/lib/supabase/server";
import { WEEK_LABELS } from "@/lib/program";
import type { WeekFocus } from "@/lib/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <AppNav />
      <main className="flex-1 space-y-4 px-4 pb-24 pt-5">
        <Link
          href="/history"
          className="text-sm font-semibold text-[var(--muted)]"
        >
          ← History
        </Link>
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            {WEEK_LABELS[session.week_focus as WeekFocus]} · Day{" "}
            {session.day_number}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {session.performed_on}
          </p>
        </header>

        <div className="space-y-3">
          {[...byExercise.entries()].map(([name, rows]) => (
            <section
              key={name}
              className="rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/5"
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
                      {r.weight} lb × {r.reps}
                      {r.ai_suggested_weight != null && (
                        <span className="ml-2 font-normal text-[var(--muted)]">
                          (AI {r.ai_suggested_weight})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {byExercise.size === 0 && (
            <p className="rounded-2xl bg-white/70 px-4 py-6 text-sm text-[var(--muted)] ring-1 ring-black/5">
              No sets logged in this session.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
