"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createClient, resetClient, refreshSessionViaServer, setKnownExpiry } from "@/lib/supabase/client";
import {
  performRobustSignOut,
  recoverSessionConnection,
  isIntentionalSignOut,
  forceLogoutToLogin,
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

  /**
   * Synchronous mirror of `user` so the async init/recovery branches can tell
   * whether onAuthStateChange has ALREADY established a valid session before
   * deciding to clear it. A getSession timeout is NOT a confirmed logout, so we
   * must never downgrade an established session to null on those paths.
   */
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

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
    // INITIAL_SESSION-based init.
    //
    // We deliberately do NOT call getSession() at mount. auth-js holds the auth
    // lock while awaiting our INITIAL_SESSION callback (which runs fetchProfile),
    // and a concurrent getSession() at startup takes auth-js's RE-ENTRANT lock
    // path — which has no timeout — and wedges on the lock's drain queue, never
    // resolving (the "getSession:auth-context-init" lock_timeout cascade that
    // then nulled a valid session). INITIAL_SESSION is the reliable signal:
    // auth-js always emits it once after initialize, reading the session under
    // the lock it already holds. We populate user/profile from that event
    // (handled in onAuthStateChange below) and use a SERVER-refresh fallback
    // only if it never arrives.
    let initialSessionHandled = false;
    const INITIAL_SESSION_FALLBACK_MS = 8_000;
    const fallbackTimer = setTimeout(async () => {
      if (initialSessionHandled) return;
      // INITIAL_SESSION did not arrive — the auth client may be wedged. Recover
      // via the SERVER refresh (reliable cookie path), NOT the client getSession
      // that can hang. A timeout here is NOT a confirmed logout.
      logConnectionEvent({
        type: "lock_timeout",
        detail: "auth init: INITIAL_SESSION not received within budget — server refresh fallback",
      });
      const serverResult = await refreshSessionViaServer("auth-context-init-fallback");
      if (initialSessionHandled) return;
      if (serverResult.reason === "no_session") {
        logConnectionEvent({ type: "token_refresh_fail", detail: "auth init fallback: server reports no session" });
        setUser(null);
        setProfile(null);
        redirectToLogin("session_check_error");
      } else if (!serverResult.ok && !userRef.current) {
        // Transient (timeout/network) and nothing established yet — do NOT
        // force-logout; the heartbeat/visibility refresh will recover.
        logConnectionEvent({ type: "network_error", detail: `auth init fallback: transient (${serverResult.reason})` });
      } else {
        // Session is valid (server ok) or already established — keep it and just
        // resolve the loading state so the UI isn't stuck.
        logConnectionEvent({ type: "api_ok", detail: "auth init fallback: session valid — resolving loading" });
      }
      setLoading(false);
    }, INITIAL_SESSION_FALLBACK_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "INITIAL_SESSION") {
          // Primary init path (replaces the old getSession-at-mount). auth-js
          // emits this once after initialize with the current session.
          initialSessionHandled = true;
          clearTimeout(fallbackTimer);
          const initialUser = session?.user ?? null;
          setKnownExpiry(session?.expires_at);
          setUser(initialUser);
          if (initialUser) {
            const profileData = await fetchProfile(initialUser.id);
            setProfile(profileData);
          } else {
            setProfile(null);
            redirectToLogin("session_expired");
          }
          setLoading(false);
          return;
        }

        if (event === "TOKEN_REFRESHED" && session) {
          logConnectionEvent({ type: "token_refresh_ok", detail: "onAuthStateChange" });
          setKnownExpiry(session.expires_at);
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
              setKnownExpiry(newSession?.expires_at);
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
        setKnownExpiry(session?.expires_at);
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
          // INITIAL_SESSION is handled earlier (and returns); any other event
          // reaching here with no user means the session is gone — go to login.
          redirectToLogin("session_expired");
        }
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
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
