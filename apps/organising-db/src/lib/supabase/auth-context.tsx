"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createClient, getSessionWithTimeout, coordinatedRefreshSession, withAuthOpTimeout, resetClient } from "@/lib/supabase/client";
import {
  performRobustSignOut,
  recoverSessionConnection,
  isIntentionalSignOut,
  forceLogoutToLogin,
  isLikelyAuthError,
  type SessionRecoveryResult,
} from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import { isPostHogEnabled } from "@/lib/posthog-config";
import type { User } from "@supabase/supabase-js";
import type { UserRole, UserProfile } from "@/types/database";

const PUBLIC_PATHS = ["/login", "/auth"];

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
  hardRefreshConnection: () => Promise<SessionRecoveryResult>;
  connectionRecoveryInProgress: boolean;
  isAdmin: boolean;
  isUser: boolean;
  isViewer: boolean;
  canWrite: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  role: "viewer",
  loading: true,
  signOut: async () => {},
  hardRefreshConnection: async () => ({
    ok: false,
    message: "Recovery not ready",
    reasonCode: "not_ready",
    redirectedToLogin: false,
  }),
  connectionRecoveryInProgress: false,
  isAdmin: false,
  isUser: false,
  isViewer: true,
  canWrite: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionRecoveryInProgress, setConnectionRecoveryInProgress] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const pathname = usePathname();

  const isProtectedRoute = !PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  /**
   * Tracks whether a recovery is in-flight inside this provider so that
   * the onAuthStateChange SIGNED_OUT handler doesn't re-enter recovery.
   */
  const recoveryInFlightRef = useRef(false);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const isRetryableProfileError = (message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("failed to fetch") ||
      lower.includes("network") ||
      lower.includes("timeout") ||
      lower.includes("connection")
    );
  };

  const redirectToLogin = useCallback((reasonCode = "session_expired") => {
    if (typeof window !== "undefined" && isProtectedRoute) {
      forceLogoutToLogin(reasonCode);
    }
  }, [isProtectedRoute]);

  const fetchProfile = useCallback(async (userId: string) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!profileError) {
        console.info("[AuthProvider] profile fetch result", {
          userId,
          outcome: data ? "ok" : "not_found",
          attempt: attempt + 1,
        });
        return data;
      }

      logConnectionEvent({ type: "api_error", detail: `profile fetch: ${profileError.message}` });
      console.info("[AuthProvider] profile fetch result", {
        userId,
        outcome: "error",
        attempt: attempt + 1,
        message: profileError.message,
      });

      if (attempt === 0 && isRetryableProfileError(profileError.message)) {
        await wait(250);
        continue;
      }

      return null;
    }

    return null;
  }, [supabase]);

  useEffect(() => {
    const initSession = async () => {
      // Two attempts with a 350 ms gap between them. getSessionWithTimeout
      // adds a 12 s ceiling per attempt so a stuck auth client can't hold
      // the loading state forever. On timeout, we fall through to a
      // coordinatedRefreshSession fallback (see below) rather than
      // force-logging out — a timeout is not a confirmed session loss.
      let getSessionSession: Awaited<ReturnType<typeof getSessionWithTimeout>>["session"] = null;
      let getSessionTimedOut = false;
      let getSessionError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await getSessionWithTimeout("auth-context-init");
          getSessionSession = result.session;
          getSessionTimedOut = result.timedOut;
          getSessionError = null;
        } catch (err) {
          getSessionError = err;
          getSessionSession = null;
          getSessionTimedOut = false;
        }
        if (!getSessionError && !getSessionTimedOut) break;
        if (attempt === 0) {
          await wait(350);
        }
      }

      try {
        if (getSessionTimedOut) {
          // getSession timed out on both attempts. This can happen during a
          // Vercel cold start or when Supabase auth is under load. A timeout
          // is NOT a confirmed session loss — the underlying call may still
          // complete. Unlike a null session (definitive logout signal), we
          // should not force-logout here.
          //
          // Strategy: try coordinatedRefreshSession as a fallback. This
          // matches the visibility handler in providers.tsx which bails
          // without force-logout on getSession timeout.
          logConnectionEvent({ type: "lock_timeout", detail: "auth init: getSession timed out — attempting refresh fallback" });
          try {
            const refreshResult = await withAuthOpTimeout(
              "auth-context-init-fallback",
              coordinatedRefreshSession("auth-context-init-fallback"),
            );
            if (!refreshResult.error && refreshResult.data.session) {
              // Refresh succeeded — proceed with the recovered session.
              const recoveredUser = refreshResult.data.session.user;
              setUser(recoveredUser);
              const profileData = await fetchProfile(recoveredUser.id);
              setProfile(profileData);
              return; // setLoading(false) fires via finally
            }
            // Refresh returned no session — genuinely missing.
            logConnectionEvent({ type: "token_refresh_fail", detail: "auth init: refresh fallback returned no session" });
            setUser(null);
            setProfile(null);
            redirectToLogin("session_check_error");
          } catch (fallbackErr) {
            const isFallbackTimeout =
              (fallbackErr as { isAuthOpTimeout?: boolean })?.isAuthOpTimeout === true;
            if (isFallbackTimeout) {
              // Refresh also timed out — Supabase auth unreachable right now.
              // Do NOT force-logout; the session may be valid. The user can refresh.
              logConnectionEvent({
                type: "network_error",
                detail: "auth init: refresh fallback also timed out — bailing without force-logout",
              });
              setUser(null);
              setProfile(null);
              // bail: setLoading(false) via finally; no redirect
            } else if (isLikelyAuthError(fallbackErr)) {
              // Confirmed auth error from the refresh.
              logConnectionEvent({
                type: "token_refresh_fail",
                detail: `auth init: refresh fallback auth error: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
              });
              setUser(null);
              setProfile(null);
              redirectToLogin("session_check_error");
            } else {
              // Network or unexpected error — not a confirmed auth failure.
              logConnectionEvent({
                type: "network_error",
                detail: `auth init: refresh fallback exception: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
              });
              setUser(null);
              setProfile(null);
              // bail without force-logout
            }
          }
          return; // setLoading(false) fires via finally
        }

        if (getSessionError) {
          // Non-timeout error from getSessionWithTimeout (unusual — it catches internally).
          const message =
            getSessionError instanceof Error ? getSessionError.message : String(getSessionError);
          logConnectionEvent({ type: "token_refresh_fail", detail: `auth init getSession error: ${message}` });
          setUser(null);
          setProfile(null);
          redirectToLogin("session_check_error");
          return;
        }

        const session = getSessionSession;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const profileData = await fetchProfile(currentUser.id);
          setProfile(profileData);
        } else {
          setProfile(null);
          redirectToLogin("session_expired");
        }
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "TOKEN_REFRESHED" && session) {
          logConnectionEvent({ type: "token_refresh_ok", detail: "onAuthStateChange" });
          setUser((prev) => {
            if (prev?.id === session.user.id) return prev;
            return session.user;
          });
          return;
        }

        const shouldRecover =
          event === "SIGNED_OUT" ||
          (!session && event === "TOKEN_REFRESHED");

        if (shouldRecover) {
          // Don't cascade: skip recovery if this SIGNED_OUT was triggered by
          // our own sign-out code or by an in-flight recovery clearing storage.
          if (isIntentionalSignOut() || recoveryInFlightRef.current) {
            logConnectionEvent({
              type: "api_error",
              detail: `skipped recovery: intentional=${isIntentionalSignOut()} inFlight=${recoveryInFlightRef.current}`,
            });
            return;
          }

          logConnectionEvent({ type: "token_refresh_fail", detail: `event=${event}` });
          recoveryInFlightRef.current = true;
          try {
            const result = await recoverSessionConnection({
              supabase,
              queryClient,
              source: "auth-change",
              reloadOnSuccess: false,
              redirectOnFailure: true,
              validateWorkloadAccess: false,
            });
            if (result.ok) {
              const { data: { session: newSession } } = await supabase.auth.getSession();
              const recoveredUser = newSession?.user ?? null;
              setUser(recoveredUser);
              if (recoveredUser) {
                const profileData = await fetchProfile(recoveredUser.id);
                setProfile(profileData);
              } else {
                setProfile(null);
              }
            }
          } finally {
            recoveryInFlightRef.current = false;
          }
          return;
        }

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          setProfile((prev) => {
            if (prev?.user_id === sessionUser.id) return prev;
            return null;
          });
          const profileData = await fetchProfile(sessionUser.id);
          setProfile(profileData);
        } else {
          setProfile(null);
          if (event !== "INITIAL_SESSION") {
            redirectToLogin("session_expired");
          }
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attribute connection/auth telemetry to the signed-in user so Sentry +
  // PostHog stop reporting "0 users impacted" / "Anonymous" for the connection
  // issues. One-time per user change — not on the request hot path.
  useEffect(() => {
    if (user) {
      try {
        Sentry.setUser({ id: user.id, email: user.email ?? undefined });
      } catch {
        // best effort
      }
      try {
        if (isPostHogEnabled() && (posthog as unknown as { __loaded?: boolean }).__loaded) {
          posthog.identify(user.id, user.email ? { email: user.email } : undefined);
        }
      } catch {
        // best effort
      }
    } else {
      try {
        Sentry.setUser(null);
      } catch {
        // best effort
      }
    }
  }, [user]);

  const signOut = async () => {
    await performRobustSignOut({
      supabase,
      queryClient,
      source: "auth-context",
    });
    setUser(null);
    setProfile(null);
  };

  const hardRefreshConnection = async (): Promise<SessionRecoveryResult> => {
    if (connectionRecoveryInProgress) {
      return {
        ok: false,
        message: "Connection refresh is already running.",
        reasonCode: "already_running",
        redirectedToLogin: false,
      };
    }

    setConnectionRecoveryInProgress(true);
    recoveryInFlightRef.current = true;
    try {
      // Drop a potentially deadlocked auth client first, then recover with a
      // fresh GoTrueClient (clears the stuck `lockAcquired` flag) rather than
      // re-joining the stuck lock chain.
      resetClient();
      const freshClient = createClient();
      const result = await recoverSessionConnection({
        supabase: freshClient,
        queryClient,
        source: "menu-hard-refresh",
        reloadOnSuccess: true,
        redirectOnFailure: true,
        validateWorkloadAccess: false,
      });
      return result;
    } finally {
      setConnectionRecoveryInProgress(false);
      recoveryInFlightRef.current = false;
    }
  };

  const role: UserRole = profile?.role ?? "viewer";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        signOut,
        hardRefreshConnection,
        connectionRecoveryInProgress,
        isAdmin: role === "admin",
        isUser: role === "user",
        isViewer: role === "viewer",
        canWrite: role === "admin" || role === "user",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
