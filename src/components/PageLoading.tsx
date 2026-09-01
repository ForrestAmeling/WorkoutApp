export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
        <div className="h-4 w-56 animate-pulse rounded bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
      </div>
      <div className="h-12 animate-pulse rounded-2xl bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
      <div className="h-12 animate-pulse rounded-2xl bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
      <div className="h-24 animate-pulse rounded-2xl bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
      <div className="h-24 animate-pulse rounded-2xl bg-[var(--card)] ring-1 ring-[var(--stroke)]" />
      <p className="sr-only">{label}</p>
    </div>
  );
}
