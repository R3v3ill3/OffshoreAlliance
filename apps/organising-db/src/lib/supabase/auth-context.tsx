"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  performRobustSignOut,
  recoverSessionConnection,
  isIntentionalSignOut,
  forceLogoutToLogin,
  type SessionRecoveryResult,
} from "@/lib/supabase/session-recovery";
import { logConnectionEvent } from "@/lib/supabase/connection-monitor";
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
      // Retry once on transient errors so cross-tab cookie-sync races
      // (new tab opens before cookies fully propagate) don't trigger a
      // destructive forceLogoutToLogin that wipes shared cookies and takes
      // down the parent tab. After retry exhaustion the existing destructive
      // path runs, preserving 48c3c1c's intent for genuinely corrupt cookies.
      let getSessionResult: Awaited<ReturnType<typeof supabase.auth.getSession>> | null = null;
      let getSessionError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          getSessionResult = await supabase.auth.getSession();
          getSessionError = getSessionResult.error ?? null;
        } catch (err) {
          getSessionError = err;
          getSessionResult = null;
        }
        if (!getSessionError) break;
        if (attempt === 0) {
          await wait(350);
        }
      }

      try {
        if (getSessionError) {
          const message = getSessionError instanceof Error ? getSessionError.message : String(getSessionError);
          logConnectionEvent({ type: "token_refresh_fail", detail: message });
          setUser(null);
          setProfile(null);
          redirectToLogin("session_check_error");
          return;
        }

        const session = getSessionResult?.data.session ?? null;
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
      const result = await recoverSessionConnection({
        supabase,
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
