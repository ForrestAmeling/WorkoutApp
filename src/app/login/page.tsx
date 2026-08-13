import { Suspense } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-5 py-10">
      <section className="w-full animate-rise rounded-3xl bg-[var(--surface)] p-5 shadow-[var(--shadow)] ring-1 ring-[var(--stroke)]">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight text-[var(--ink)]">
          Reps
        </h1>
        <p className="mt-1 mb-5 text-sm text-[var(--muted)]">
          Password for everyday use, or email code when you need it.
        </p>
        <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </section>
      <div className="mt-4 w-full">
        <InstallPrompt />
      </div>
    </main>
  );
}
