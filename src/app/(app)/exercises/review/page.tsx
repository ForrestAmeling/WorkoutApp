import Link from "next/link";
import { notFound } from "next/navigation";
import { ExerciseReviewQueue } from "@/components/ExerciseReviewQueue";
import { isAppAdmin } from "@/lib/app-admin";
import type { CustomExercise } from "@/lib/custom-exercises";
import {
  nextPublishDue,
  PUBLISH_BATCH_SIZE,
} from "@/lib/exercise-publishing";
import { formatHumanDate, localISODate } from "@/lib/program";
import { requireBillingPage } from "@/lib/require-billing";

type Submission = {
  id: string;
  pr_number: number | null;
  pr_url: string | null;
  status: "open" | "merged" | "closed";
  created_at: string;
};

function shortDate(d: Date | string) {
  return formatHumanDate(localISODate(new Date(d)), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ExerciseReviewPage() {
  const { user, supabase } = await requireBillingPage();
  if (!(await isAppAdmin(supabase, user.id))) notFound();

  // Requested/approved exercises are always shared, so RLS lets the admin read them.
  const [{ data: requested }, { data: approved }, { data: submissions }] =
    await Promise.all([
      supabase
        .from("custom_exercises")
        .select("*")
        .eq("publish_status", "requested")
        .order("publish_consented_at"),
      supabase
        .from("custom_exercises")
        .select("id, publish_reviewed_at")
        .eq("publish_status", "approved")
        .order("publish_reviewed_at"),
      supabase
        .from("exercise_submissions")
        .select("id, pr_number, pr_url, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const waiting = approved ?? [];
  const recent = (submissions ?? []) as Submission[];
  const due = nextPublishDue({
    lastPrAt: recent[0]?.created_at ?? null,
    oldestApprovedAt: (waiting[0]?.publish_reviewed_at as string | undefined) ?? null,
  });

  return (
    <>
      <Link href="/exercises" className="text-sm font-semibold text-[var(--muted)]">
        ← My exercises
      </Link>
      <header className="mt-3 mb-5">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          Review submissions
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Exercises users asked to send to free-exercise-db. Approved ones go out
          together as one pull request.
        </p>
      </header>

      <section className="mb-5 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)] ring-1 ring-[var(--accent)]">
        {waiting.length === 0 ? (
          "Nothing approved and waiting."
        ) : (
          <>
            <span className="font-semibold">{waiting.length} approved</span> and
            waiting. The next pull request opens when {PUBLISH_BATCH_SIZE} are
            waiting{due ? ` or on ${shortDate(due)}, whichever comes first` : ""}.
          </>
        )}
      </section>

      <ExerciseReviewQueue initial={(requested ?? []) as CustomExercise[]} />

      {recent.length ? (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Recent pull requests
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {recent.map((s) => (
              <li key={s.id} className="text-[var(--ink)]">
                {s.pr_url ? (
                  <a
                    href={s.pr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[var(--accent-text)]"
                  >
                    PR #{s.pr_number}
                  </a>
                ) : (
                  "PR"
                )}
                <span className="text-[var(--muted)]">
                  {" "}
                  · {shortDate(s.created_at)} · {s.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
