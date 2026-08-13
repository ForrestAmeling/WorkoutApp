"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/routines", label: "Routines" },
  { href: "/progress", label: "Progress" },
  { href: "/history", label: "History" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--stroke)] bg-[var(--surface)]">
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href="/today"
            className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--ink)]"
          >
            Reps
          </Link>
          <Link
            href="/settings"
            className="rounded-lg px-2 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Settings
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-5">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--stroke)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`min-h-14 px-1 py-2 text-center text-xs font-bold ${
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
