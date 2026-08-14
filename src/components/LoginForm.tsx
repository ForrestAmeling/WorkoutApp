"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Tab = "password" | "code";
type PasswordStep = "credentials" | "verifySignup";
type CodeStep = "request" | "verify";

function isEmailNotConfirmed(error: { message: string; code?: string }) {
  return (
    error.code === "email_not_confirmed" ||
    error.message.toLowerCase().includes("email not confirmed")
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("password");
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("credentials");
  const [codeStep, setCodeStep] = useState<CodeStep>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) {
      setIsError(true);
      setMessage(err);
      setTab("code");
      setCodeStep("verify");
    }
  }, [searchParams]);

  function showError(text: string) {
    setIsError(true);
    setMessage(text);
  }

  function showInfo(text: string) {
    setIsError(false);
    setMessage(text);
  }

  function goToSignupVerify(info: string) {
    setPasswordStep("verifySignup");
    setOtp("");
    showInfo(info);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      if (isEmailNotConfirmed(error)) {
        goToSignupVerify(
          "Check your email for a 6-digit code, then enter it below to finish signing up."
        );
        return;
      }
      showError(error.message);
      return;
    }
    router.replace("/today");
    router.refresh();
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      showError("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    if (data.session) {
      router.replace("/today");
      router.refresh();
      return;
    }
    goToSignupVerify(
      "Account created. Enter the 6-digit code we emailed you to finish signing up."
    );
  }

  async function verifySignupCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "signup",
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    router.replace("/today");
    router.refresh();
  }

  async function resendSignupCode() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    showInfo("New code sent. Check your inbox (and spam).");
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    setCodeStep("verify");
    showInfo(
      "Email sent. Enter the 6-digit code (more reliable than the link on phones)."
    );
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      showError(error.message);
      return;
    }
    router.replace("/today");
    router.refresh();
  }

  const otpInput = (
    <div>
      <label
        htmlFor="otp"
        className="mb-1 block text-sm font-semibold text-[var(--ink)]"
      >
        6-digit code
      </label>
      <input
        id="otp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        required
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="123456"
        className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-center text-2xl font-bold tracking-[0.3em] text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl bg-[var(--canvas)] p-1 ring-1 ring-[var(--stroke)]">
        <button
          type="button"
          onClick={() => {
            setTab("password");
            setPasswordStep("credentials");
            setMessage(null);
          }}
          className={`min-h-11 flex-1 rounded-lg text-sm font-bold ${
            tab === "password"
              ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
              : "text-[var(--muted)]"
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("code");
            setMessage(null);
          }}
          className={`min-h-11 flex-1 rounded-lg text-sm font-bold ${
            tab === "code"
              ? "bg-[var(--card)] text-[var(--ink)] shadow-sm"
              : "text-[var(--muted)]"
          }`}
        >
          Email code
        </button>
      </div>

      {tab === "password" && passwordStep === "verifySignup" ? (
        <form onSubmit={verifySignupCode} className="space-y-4">
          <div>
            <label
              htmlFor="email-signup"
              className="mb-1 block text-sm font-semibold text-[var(--ink)]"
            >
              Email
            </label>
            <input
              id="email-signup"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {otpInput}
          <button
            type="submit"
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify code"}
          </button>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={() => void resendSignupCode()}
            className="w-full text-sm font-semibold text-[var(--muted)] disabled:opacity-50"
          >
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setPasswordStep("credentials");
              setOtp("");
              setMessage(null);
            }}
            className="w-full text-sm font-semibold text-[var(--muted)]"
          >
            Back to sign in
          </button>
        </form>
      ) : tab === "password" ? (
        <form onSubmit={signInWithPassword} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-semibold text-[var(--ink)]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-semibold text-[var(--ink)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => void createAccount(e)}
            className="min-h-12 w-full rounded-xl bg-[var(--solid)] text-sm font-bold text-[var(--on-solid)] disabled:opacity-60"
          >
            Create account
          </button>
          <p className="text-center text-xs text-[var(--muted)]">
            Creating an account starts your 1-month free trial.
          </p>
          <button
            type="button"
            disabled={busy || !email.trim()}
            onClick={async () => {
              setBusy(true);
              setMessage(null);
              const supabase = createClient();
              const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim(),
                {
                  redirectTo: `${window.location.origin}/auth/callback?next=/today`,
                }
              );
              setBusy(false);
              if (error) {
                showError(error.message);
                return;
              }
              showInfo(
                "Password reset email sent (same rate limit as magic links). Check your inbox."
              );
            }}
            className="w-full text-sm font-semibold text-[var(--muted)] disabled:opacity-50"
          >
            Forgot password?
          </button>
        </form>
      ) : codeStep === "verify" ? (
        <form onSubmit={verifyCode} className="space-y-4">
          <div>
            <label
              htmlFor="email-confirm"
              className="mb-1 block text-sm font-semibold text-[var(--ink)]"
            >
              Email
            </label>
            <input
              id="email-confirm"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          {otpInput}
          <button
            type="submit"
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Sign in with code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCodeStep("request");
              setOtp("");
              setMessage(null);
            }}
            className="w-full text-sm font-semibold text-[var(--muted)]"
          >
            Send a new code
          </button>
        </form>
      ) : (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label
              htmlFor="email-code"
              className="mb-1 block text-sm font-semibold text-[var(--ink)]"
            >
              Email
            </label>
            <input
              id="email-code"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-h-14 w-full rounded-xl bg-[var(--input)] px-4 text-base text-[var(--ink)] ring-1 ring-[var(--stroke)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-14 w-full rounded-xl bg-[var(--accent)] text-base font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send login code"}
          </button>
          <p className="text-xs text-[var(--muted)]">
            Uses Supabase email limits (~2/hour on default SMTP). Prefer
            password for daily login.
          </p>
        </form>
      )}

      {message && (
        <p
          className={`text-sm leading-relaxed ${
            isError ? "text-[var(--danger)]" : "text-[var(--muted)]"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
