"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function StartWorkoutButton({
  routineId,
  isActive,
}: {
  routineId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (!isActive) {
      const { error: clearError } = await supabase
        .from("routines")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .neq("id", routineId);
      if (clearError) {
        setBusy(false);
        setError(clearError.message);
        return;
      }
      const { error: activeError } = await supabase
        .from("routines")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", routineId);
      if (activeError) {
        setBusy(false);
        setError(activeError.message);
        return;
      }
    }

    router.push("/today");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
      >
        {busy
          ? "Opening…"
          : isActive
            ? "Log workout on Today"
            : "Set active & log on Today"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
