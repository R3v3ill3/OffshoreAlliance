"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";

export const WORKSPACE_DEFAULTS_QUERY_KEY = ["workspace-defaults"] as const;

/**
 * WP1.1 — the org-wide workspace defaults, read through the narrow
 * SECURITY DEFINER `get_workspace_defaults()` reader so a user/viewer
 * client never needs SELECT on `app_settings`.
 *
 * Returns the raw jsonb (typed `unknown`; resolve.ts parses it). On any
 * error `data` is `undefined`, which the resolver treats as "nothing
 * stored" → full mode. One RPC per session (staleTime), never per page.
 */
export function useWorkspaceDefaults() {
  const { user } = useAuth();
  const supabase = createClient();

  return useQuery<unknown>({
    queryKey: WORKSPACE_DEFAULTS_QUERY_KEY,
    queryFn: async () => {
      // `createClient()` returns an untyped `SupabaseClient`, so this rpc()
      // call typechecks before `packages/db-types/generated.ts` gains the
      // `get_workspace_defaults` entry (the verifier regenerates types from
      // dev after applying the migration). No cast is needed.
      const { data, error } = await supabase.rpc("get_workspace_defaults");
      if (error) throw error;
      return (data ?? {}) as unknown;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
