import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { RoutineEditor } from "@/components/RoutineEditor";
import { StartWorkoutButton } from "@/components/StartWorkoutButton";
import { createClient } from "@/lib/supabase/server";
import { loadRoutineEditor } from "@/lib/routines";

type Props = { params: Promise<{ id: string }> };

export default async function RoutineDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await loadRoutineEditor(supabase, id);
  if (!data || data.routine.user_id !== user.id) notFound();

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
            Customize
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Edit manually or with AI. Changes save to this routine. Use Copy on
            the Routines list to duplicate first if you want a new version.
          </p>
        </header>
        <StartWorkoutButton
          routineId={data.routine.id}
          isActive={data.routine.is_active}
        />
        <RoutineEditor routine={data.routine} days={data.days} />
      </main>
    </div>
  );
}
