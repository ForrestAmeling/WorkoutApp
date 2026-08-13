"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/components/SettingsProvider";

export function InstallPrompt() {
  const { settings, update, ready } = useSettings();
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (!ready || settings.installHintDismissed) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) return;
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setVisible(true);
  }, [ready, settings.installHintDismissed]);

  if (!visible) return null;

  return (
    <div className="rounded-2xl bg-[var(--card)] px-4 py-3 ring-1 ring-[var(--stroke)]">
      <p className="text-sm font-bold text-[var(--ink)]">Add Reps to your home screen</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        {isIOS
          ? "Tap Share, then Add to Home Screen — works like an app at the gym."
          : "Use your browser menu → Add to Home Screen (or Install app)."}
      </p>
      <button
        type="button"
        onClick={() => {
          update({ installHintDismissed: true });
          setVisible(false);
        }}
        className="mt-2 text-sm font-semibold text-[var(--accent-text)]"
      >
        Got it
      </button>
    </div>
  );
}
