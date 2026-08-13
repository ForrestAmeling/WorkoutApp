"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = searchParams.get("next") ?? "/today";
    const errorDescription = searchParams.get("error_description");

    async function finish() {
      if (errorDescription) {
        router.replace(
          `/login?error=${encodeURIComponent(errorDescription)}`
        );
        return;
      }

      const supabase = createClient();

      // token_hash flow (works across browsers / email apps)
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "email" | "magiclink",
        });
        if (error) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      // PKCE code flow — must be same browser that requested the link
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(
            `/login?error=${encodeURIComponent(
              `${error.message}. Tip: enter the 6-digit code from the email instead — magic links fail when your email app opens a different browser.`
            )}`
          );
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      setMessage("Missing login code. Sending you back…");
      router.replace("/login?error=Missing%20auth%20code");
    }

    void finish();
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-5">
      <p className="text-sm font-semibold text-[var(--muted)]">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-5">
          <p className="text-sm font-semibold text-[var(--muted)]">
            Signing you in…
          </p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
