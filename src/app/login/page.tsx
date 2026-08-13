import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-end px-5 pb-10 pt-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[55dvh] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#1a2a12_0%,#2f4a38_45%,#9bb86c_100%)]" />
        <div className="absolute -right-8 top-16 h-40 w-40 rounded-full bg-[var(--accent)]/40 blur-2xl animate-pulse-soft" />
        <div className="absolute bottom-10 left-6 right-6">
          <p className="font-[family-name:var(--font-display)] text-6xl font-extrabold leading-none tracking-tight text-white">
            IronLog
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/85">
            Today&apos;s sets, targets, and AI starting weights — built for the
            phone at the rack.
          </p>
        </div>
      </div>

      <section className="relative z-10 animate-rise rounded-3xl bg-[var(--surface)]/95 p-5 shadow-[0_20px_60px_rgba(20,32,28,0.18)] ring-1 ring-black/5">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[var(--ink)]">
          Sign in
        </h1>
        <p className="mt-1 mb-5 text-sm text-[var(--muted)]">
          Password for everyday use, or email code when you need it.
        </p>
        <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
