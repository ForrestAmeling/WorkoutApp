"use client";

import { useEffect, useRef, useState } from "react";

export function RestTimer({
  endsAt,
  onDone,
}: {
  endsAt: number | null;
  onDone: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    doneRef.current = false;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt
    ? Math.max(0, Math.ceil((endsAt - now) / 1000))
    : 0;

  useEffect(() => {
    if (!endsAt || remaining > 0 || doneRef.current) return;
    doneRef.current = true;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(200);
    }
    onDone();
  }, [endsAt, remaining, onDone]);

  if (!endsAt) return null;

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const label = `${m}:${String(s).padStart(2, "0")}`;

  return (
    <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-full max-w-lg px-4">
      <div className="flex items-center justify-between rounded-2xl bg-[var(--solid)] px-4 py-3 text-[var(--on-solid)] ring-1 ring-[var(--stroke)]">
        <p className="text-sm font-semibold">
          {remaining === 0 ? "Rest done" : "Rest"}
        </p>
        <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold tabular-nums">
          {remaining === 0 ? "Next set" : label}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="text-sm font-semibold text-[var(--on-solid)]"
        >
          {remaining === 0 ? "OK" : "Skip"}
        </button>
      </div>
    </div>
  );
}
