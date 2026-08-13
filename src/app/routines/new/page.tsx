import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { NewRoutineForm } from "@/components/NewRoutineForm";
import { createClient } from "@/lib/supabase/server";

export default async function NewRoutinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <AppNav />
      <main className="flex-1 space-y-5 px-4 pb-24 pt-5">
        <Link
          href="/routines"
          className="text-sm font-semibold text-[var(--muted)]"
        >
          ← Routines
        </Link>
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
            New routine
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pick days/week, then build or let AI draft it. Exercises come from
            free-exercise-db.
          </p>
        </header>
        <NewRoutineForm />
      </main>
    </div>
  );
}
