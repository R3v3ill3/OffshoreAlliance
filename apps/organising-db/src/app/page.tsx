"use client";

// Neutral landing gate (WP1.3). Renders no product surface, issues no query.
//
// Workspace mode is only knowable client-side once the profile has loaded
// (`resolveWorkspace` needs work_role, workspace_prefs and the defaults RPC),
// so the post-login hop lands here — outside the (dashboard) group, with no
// sidebar or header that could be the wrong page — and `router.replace`s to
// `/campaigns` (full mode, unchanged) or `/my-campaigns?from=landing`
// (organiser mode) once `canDecideLanding` (landing.ts L5) says the mode is
// real: nothing loading, and the signed-in user's profile present. The
// resolver returns `full` while its inputs are absent, so deciding on
// `useWorkspace().loading` alone sent an organiser to `/campaigns` whenever
// the gate mounted before the post-login profile fetch landed (fix round 1).
// Middleware already sends a signed-out visitor for `/` to `/login`.
//
// Failsafe: if the profile never resolves, 5 s later the gate falls back to
// today's `/campaigns` rather than a stuck spinner.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { useWorkspace } from "@/lib/workspace/use-workspace";
import {
  FULL_MODE_LANDING_PATH,
  canDecideLanding,
  landingPathFor,
} from "@/lib/workspace/landing";

const LANDING_FAILSAFE_MS = 5_000;

export default function LandingGate() {
  const router = useRouter();
  const { mode, loading } = useWorkspace();
  const { user, profile } = useAuth();
  const decided = useRef(false);
  const ready = canDecideLanding({
    loading,
    hasUser: user != null,
    hasProfile: profile != null,
  });

  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    router.replace(landingPathFor({ mode }));
  }, [ready, mode, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (decided.current) return;
      decided.current = true;
      router.replace(FULL_MODE_LANDING_PATH);
    }, LANDING_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <p className="text-sm" role="status">
        Loading your workspace…
      </p>
    </div>
  );
}
