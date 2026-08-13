"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const link = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-lg px-1.5 py-2 text-sm font-semibold transition sm:px-2.5 ${
            active
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-3 py-3">
        <Link
          href="/today"
          className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]"
        >
          IronLog
        </Link>
        <nav className="flex items-center gap-0.5">
          {link("/today", "Today")}
          {link("/routines", "Routines")}
          {link("/progress", "Progress")}
          {link("/history", "History")}
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg px-2 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Out
          </button>
        </nav>
      </div>
    </header>
  );
}
