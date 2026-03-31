"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { UserRole, UserProfile } from "@/types/database";

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
  const queryClient = useQueryClient();

  useEffect(() => {
    const getUser = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:getUser-start',message:'getUser called',data:{cookies:document.cookie.length,href:window.location.href},timestamp:Date.now(),hypothesisId:'H-A,H-C'})}).catch(()=>{});
      // #endregion
      const { data: { user }, error } = await supabase.auth.getUser();
      // #region agent log
      fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:getUser-result',message:'getUser result',data:{userId:user?.id??null,error:error?.message??null,cookieCount:document.cookie.split(';').filter(Boolean).length},timestamp:Date.now(),hypothesisId:'H-A,H-C'})}).catch(()=>{});
      // #endregion
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // #region agent log
        fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:onAuthStateChange',message:'auth state change',data:{event,sessionUserId:session?.user?.id??null,hasSession:!!session,tokenExpiresAt:session?.expires_at??null},timestamp:Date.now(),hypothesisId:'H-B'})}).catch(()=>{});
        // #endregion
        if (event === "SIGNED_OUT" || (!session && event === "TOKEN_REFRESHED")) {
          // #region agent log
          fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:redirecting-to-login',message:'REDIRECTING TO LOGIN from auth state change',data:{event,hasSession:!!session},timestamp:Date.now(),hypothesisId:'H-B'})}).catch(()=>{});
          // #endregion
          queryClient.clear();
          window.location.href = "/login";
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          // #region agent log
          const _profileFetchStart = Date.now();
          fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:profileFetch-start',message:'Profile fetch START in onAuthStateChange',data:{event,userId:session.user.id,elapsedSinceEvent:0},timestamp:Date.now(),hypothesisId:'H-C'})}).catch(()=>{});
          // #endregion
          const { data } = await supabase
            .from("user_profiles")
            .select("*")
            .eq("user_id", session.user.id)
            .single();
          // #region agent log
          fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'auth-context.tsx:profileFetch-done',message:'Profile fetch DONE in onAuthStateChange',data:{event,userId:session.user.id,durationMs:Date.now()-_profileFetchStart,hasData:!!data},timestamp:Date.now(),hypothesisId:'H-C'})}).catch(()=>{});
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
    await supabase.auth.signOut();
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
