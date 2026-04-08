"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  performRobustSignOut,
  recoverSessionConnection,
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

  const redirectToLogin = useCallback(() => {
    if (typeof window !== "undefined" && isProtectedRoute) {
      logConnectionEvent({ type: "session_lost", detail: "client-side null session redirect" });
      window.location.href = `/login?reason=session_expired`;
    }
  }, [isProtectedRoute]);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (profileError) {
      logConnectionEvent({ type: "api_error", detail: `profile fetch: ${profileError.message}` });
    }
    return data;
  }, [supabase]);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          logConnectionEvent({ type: "token_refresh_fail", detail: error.message });
          setUser(null);
          setProfile(null);
          redirectToLogin();
          return;
        }
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          const profileData = await fetchProfile(currentUser.id);
          setProfile(profileData);
        } else {
          setProfile(null);
          redirectToLogin();
        }
      } catch (error: unknown) {
        logConnectionEvent({
          type: "token_refresh_fail",
          detail: error instanceof Error ? error.message : String(error),
        });
        setUser(null);
        setProfile(null);
        redirectToLogin();
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const shouldRecover =
          event === "SIGNED_OUT" ||
          (!session && event === "TOKEN_REFRESHED");

        if (event === "TOKEN_REFRESHED" && session) {
          logConnectionEvent({ type: "token_refresh_ok", detail: "onAuthStateChange" });
        }

        if (shouldRecover) {
          logConnectionEvent({ type: "token_refresh_fail", detail: `event=${event}` });
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
          return;
        }

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          const profileData = await fetchProfile(sessionUser.id);
          setProfile(profileData);
        } else {
          setProfile(null);
          if (event !== "INITIAL_SESSION") {
            redirectToLogin();
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
    try {
      return await recoverSessionConnection({
        supabase,
        queryClient,
        source: "menu-hard-refresh",
        reloadOnSuccess: true,
        redirectOnFailure: true,
        validateWorkloadAccess: false,
      });
    } finally {
      setConnectionRecoveryInProgress(false);
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
