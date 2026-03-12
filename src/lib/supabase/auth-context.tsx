"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { UserRole, UserProfile } from "@/types/database";

// #region agent log - debug helpers
const _dbgPost = (msg: string, data: Record<string, unknown>, hyp: string) =>
  fetch('http://127.0.0.1:7432/ingest/c8c97c5f-af35-4118-b37c-4421b9062a9c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3b174c'},body:JSON.stringify({sessionId:'3b174c',location:'auth-context.tsx',message:msg,data,hypothesisId:hyp,timestamp:Date.now()})}).catch(()=>{});
// #endregion

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
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
  isAdmin: false,
  isUser: false,
  isViewer: true,
  canWrite: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // #region agent log - H4: track supabase reference stability
  _dbgPost('AuthProvider render - supabase ref', { hasUser: !!user, loading }, 'H4');
  // #endregion

  useEffect(() => {
    const getUser = async () => {
      // #region agent log - H1/H3: getUser() called
      _dbgPost('getUser() start', {}, 'H1');
      // #endregion
      const { data: { user }, error } = await supabase.auth.getUser();
      // #region agent log - H1/H3: getUser() result
      _dbgPost('getUser() result', { userId: user?.id ?? null, email: user?.email ?? null, error: error?.message ?? null }, 'H1');
      // #endregion
      setUser(user);

      if (user) {
        const { data, error: profileError } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();
        // #region agent log - H3: profile fetch result
        _dbgPost('getUser profile fetch', { hasProfile: !!data, role: (data as {role?: string} | null)?.role ?? null, profileError: profileError?.message ?? null }, 'H3');
        // #endregion
        setProfile(data);
      }
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        // #region agent log - H1/H2: auth state change event
        _dbgPost('onAuthStateChange fired', { event: _event, userId: session?.user?.id ?? null, hasSession: !!session, expiresAt: session?.expires_at ?? null }, 'H1');
        // #endregion
        setUser(session?.user ?? null);
        if (session?.user) {
          const { data, error: profileError } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", session.user.id)
            .single();
          // #region agent log - H3: profile fetch in onAuthStateChange
          _dbgPost('onAuthStateChange profile fetch', { hasProfile: !!data, role: (data as {role?: string} | null)?.role ?? null, profileError: profileError?.message ?? null }, 'H3');
          // #endregion
          setProfile(data);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    // #region agent log - H2: signOut initiated
    _dbgPost('signOut() called', { userId: user?.id ?? null }, 'H2');
    // #endregion
    const { error } = await supabase.auth.signOut();
    // #region agent log - H2: signOut result
    _dbgPost('signOut() result', { error: error?.message ?? null, status: error?.status ?? null }, 'H2');
    // #endregion
    setUser(null);
    setProfile(null);
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
