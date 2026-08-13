"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSettings } from "@/components/SettingsProvider";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export function SettingsForm() {
  const { settings, update } = useSettings();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Units
        </h2>
        <div className="flex gap-2">
          {(["lb", "kg"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => update({ unit })}
              className={`min-h-12 flex-1 rounded-xl text-sm font-bold ${
                settings.unit === unit
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
              }`}
            >
              {unit === "lb" ? "Pounds" : "Kilograms"}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--muted)]">
          Stored in pounds; this only changes how weights display.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Rest timer
        </h2>
        <div className="flex gap-2">
          {[60, 90, 120, 180].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => update({ restSeconds: sec })}
              className={`min-h-12 flex-1 rounded-xl text-sm font-bold ${
                settings.restSeconds === sec
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Appearance
        </h2>
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => update({ theme })}
              className={`min-h-12 flex-1 rounded-xl text-sm font-bold capitalize ${
                settings.theme === theme
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--card)] text-[var(--muted)] ring-1 ring-[var(--stroke)]"
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Account
        </h2>
        <button
          type="button"
          onClick={() => void signOut()}
          className="min-h-12 w-full rounded-xl bg-[var(--solid)] text-sm font-bold text-[var(--on-solid)]"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => update({ ...DEFAULT_SETTINGS })}
          className="w-full text-sm font-semibold text-[var(--muted)]"
        >
          Reset settings
        </button>
      </section>
    </div>
  );
}
