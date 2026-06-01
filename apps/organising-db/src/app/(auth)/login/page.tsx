"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient, resetClient, withAuthOpTimeout, isAuthLockTimeout } from "@/lib/supabase/client";

// Bound each sign-in attempt so a jammed in-tab auth lock can't leave the
// button stuck on "Signing in…" indefinitely. 8 s is below auth-js's own 5 s
// acquire timeout for the contended case and comfortably above a healthy
// round-trip, so we fail fast enough to reset + retry within a reasonable wait.
const LOGIN_SIGNIN_TIMEOUT_MS = 8_000;

const LOCK_BUSY_MESSAGE =
  "The connection is recovering from a hiccup. Please wait a few seconds and try Sign In again.";

const LOGIN_REASON_MESSAGES: Record<string, string> = {
  session_expired: "Your session expired. Please sign in again.",
  session_check_error: "We could not verify your session. Please sign in again.",
  missing_session: "Your session is no longer active. Please sign in again.",
  refresh_failed: "We could not refresh your session. Please sign in again.",
  probe_error: "Your session could not be validated. Please sign in again.",
  circuit_breaker: "We reset your session after repeated connection issues. Please sign in again.",
  nuclear_reset: "Your browser session was reset. Please sign in again.",
  signed_out: "You have been signed out.",
};

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const reasonMessage = reason ? LOGIN_REASON_MESSAGES[reason] : null;

  // One bounded sign-in attempt against a freshly-resolved client. Always
  // re-reads createClient() so a preceding resetClient() takes effect.
  const attemptSignIn = () =>
    withAuthOpTimeout(
      "login-signin",
      createClient().auth.signInWithPassword({ email, password }),
      LOGIN_SIGNIN_TIMEOUT_MS,
    );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let result: Awaited<ReturnType<typeof attemptSignIn>>;
      try {
        result = await attemptSignIn();
      } catch (err) {
        // A jammed auth lock (either the re-entrant wait our timeout caught, or
        // auth-js's ProcessLockAcquireTimeoutError) is NOT a credential failure.
        // Drop the stuck GoTrueClient and retry once with a fresh one.
        if (isAuthLockTimeout(err)) {
          resetClient();
          result = await attemptSignIn();
        } else {
          throw err;
        }
      }

      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      router.push("/campaigns");
      router.refresh();
    } catch (err) {
      // Still jammed after a reset + retry — the holding op self-clears once its
      // fetch aborts (~20 s), so guide the user to wait briefly rather than show
      // a confusing raw "Acquiring process lock…" timeout.
      setError(
        isAuthLockTimeout(err)
          ? LOCK_BUSY_MESSAGE
          : err instanceof Error
            ? err.message
            : "Sign in failed. Please try again.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <div className="flex w-full max-w-2xl flex-col gap-0">

        {/* Header */}
        <div className="pb-4 text-center">
          <h1 className="text-2xl font-black uppercase tracking-widest text-white">
            Offshore Alliance
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">
            Campaign Database
          </p>
        </div>

        {/* Video frame */}
        <div className="w-full border-2 border-zinc-600 bg-black aspect-video overflow-hidden">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
          >
            <source src="/heritage_Eureka.mp4" type="video/mp4" />
          </video>
        </div>

        {/* Sign-in card */}
        <div className="border-2 border-t-0 border-zinc-600 bg-zinc-900 p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-400"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@offshorealliance.org.au"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-widest text-zinc-400"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {reasonMessage && !error && (
              <p className="border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {reasonMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
