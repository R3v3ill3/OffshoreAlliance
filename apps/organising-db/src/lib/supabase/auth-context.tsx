"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { agentDebugLog } from "@/lib/agent-debug-log";
import {
  performRobustSignOut,
  recoverSessionConnection,
  type SessionRecoveryResult,
} from "@/lib/supabase/session-recovery";
import type { User } from "@supabase/supabase-js";
import type { UserRole, UserProfile } from "@/types/database";

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

  useEffect(() => {
    // Use getSession() (reads local cookie state, no network request) instead of
    // getUser() (verifies JWT with auth server, can hang and block all Supabase ops).
    // Server-side JWT verification is handled by middleware — client doesn't need it.
    const initSession = async () => {
      // #region agent log
      agentDebugLog({
        location: "auth-context.tsx:getSession-start",
        message: "getSession called (replaces getUser)",
        data: { href: window.location.href },
        hypothesisId: "H5",
      });
      // #endregion
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          agentDebugLog({
            location: "auth-context.tsx:getSession-error",
            message: "getSession returned error",
            data: { errorMessage: error.message, errorCode: error.code ?? null },
            hypothesisId: "H5",
          });
          setUser(null);
          setProfile(null);
          return;
        }
        const user = session?.user ?? null;
      // #region agent log
        agentDebugLog({
          location: "auth-context.tsx:getSession-result",
          message: "getSession result",
          data: {
            userId: user?.id ?? null,
            hasSession: !!session,
            tokenExpiresAt: session?.expires_at ?? null,
          },
          hypothesisId: "H5",
        });
        // #endregion
        setUser(user);

        if (user) {
          const { data } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .single();
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch (error: unknown) {
        agentDebugLog({
          location: "auth-context.tsx:getSession-exception",
          message: "getSession threw exception",
          data: {
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          hypothesisId: "H5",
        });
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // #region agent log
        const redirectLogin =
          event === "SIGNED_OUT" ||
          (!session && event === "TOKEN_REFRESHED");
        agentDebugLog({
          location: "auth-context.tsx:onAuthStateChange",
          message: "auth state change",
          data: {
            event,
            sessionUserId: session?.user?.id ?? null,
            hasSession: !!session,
            tokenExpiresAt: session?.expires_at ?? null,
            redirectLogin,
          },
          hypothesisId: "H1",
        });
        // #endregion
        if (redirectLogin) {
          await recoverSessionConnection({
            supabase,
            queryClient,
            source: "auth-change",
            reloadOnSuccess: false,
            redirectOnFailure: true,
            validateWorkloadAccess: false,
          });
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          // #region agent log
          const _profileFetchStart = Date.now();
          agentDebugLog({
            location: "auth-context.tsx:profileFetch-start",
            message: "Profile fetch START in onAuthStateChange",
            data: { event, userId: session.user.id },
            hypothesisId: "H1",
          });
          // #endregion
          const { data } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", session.user.id)
            .single();
          // #region agent log
          agentDebugLog({
            location: "auth-context.tsx:profileFetch-done",
            message: "Profile fetch DONE in onAuthStateChange",
            data: {
              event,
              userId: session.user.id,
              durationMs: Date.now() - _profileFetchStart,
              hasData: !!data,
            },
            hypothesisId: "H1",
          });
          // #endregion
          setProfile(data);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  // supabase is a singleton so this dep is stable; queryClient is stable from useState
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
