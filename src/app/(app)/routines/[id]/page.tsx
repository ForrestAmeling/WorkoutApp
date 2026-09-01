import Link from "next/link";
import { notFound } from "next/navigation";
import { RoutineEditor } from "@/components/RoutineEditor";
import { StartWorkoutButton } from "@/components/StartWorkoutButton";
import { requireBillingPage } from "@/lib/require-billing";
import { loadRoutineEditor } from "@/lib/routines";

type Props = { params: Promise<{ id: string }> };

export default async function RoutineDetailPage({ params }: Props) {
  const { id } = await params;
  const { user, supabase } = await requireBillingPage();

  const data = await loadRoutineEditor(supabase, id);
  if (!data || data.routine.user_id !== user.id) notFound();

  return (
    <>
      <Link
        href="/routines"
        className="text-sm font-semibold text-[var(--muted)]"
      >
        ← Routines
      </Link>
      <header className="mt-3 mb-5">
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
      <div className="mt-5">
        <RoutineEditor routine={data.routine} days={data.days} />
      </div>
    </>
  );
}
