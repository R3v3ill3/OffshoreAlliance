"use client";

// WP1.7 — per-user first-use hint state, server-side.
//
// The seen/dismissed state of a hint changes what an organiser sees, so it is
// a row in public.user_hint_dismissals (owner-only RLS) and never a
// localStorage key (plan 5.1 principle 6, plan §7 "What not to do").

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import type { HintId } from "./registry";
import { shouldShowHint } from "./should-show";

export interface UseFirstUseHintOptions {
  /** The screen has at least one thing the hint can point at. */
  hasTiles: boolean;
  /** The viewer may edit; a read-only viewer has no control to hint at. */
  canWrite: boolean;
}

export interface FirstUseHintState {
  visible: boolean;
  /** Hides the hint now and records the dismissal for this user. Idempotent. */
  dismiss: () => void;
}

export const HINT_DISMISSALS_QUERY_KEY = "hint-dismissals" as const;

/**
 * One query per signed-in user for all of their dismissals (`staleTime:
 * Infinity` — a dismissal cannot un-happen within a session), plus a write.
 *
 * `dismiss()` adds the id to the CACHED list first, synchronously, so the
 * callout disappears on the click, not on the round trip — and because the
 * optimistic entry lives in the query cache rather than in this hook's
 * state, it survives leaving and re-entering the wall chart (every instance
 * of the hook reads the same cache entry).
 *
 * `staleTime: Infinity` does not make the cache entry permanent: the app
 * calls a bare `queryClient.invalidateQueries()` after session recovery
 * (`providers.tsx`, `session-recovery.ts`), which refetches every active
 * query and replaces this list with whatever the table holds. If the write
 * had not landed by then, the optimistic entry is gone and the hint shows
 * again. So `onSuccess` re-applies the entry — a late but successful write
 * wins over a refetch that raced it. A FAILED write is logged and the cached
 * entry kept, but that entry only lasts until the next background
 * invalidation; the hint can then come back in the same session, and will
 * in the next one regardless. Outside a session the hook issues no query and
 * reports `visible: false`.
 *
 * `createClient()` returns an untyped `SupabaseClient`, so
 * `.from("user_hint_dismissals")` compiles before the generated types carry
 * the table; the row shape is `UserHintDismissal` in organising-row-types.
 */
export function useFirstUseHint(id: HintId, opts: UseFirstUseHintOptions): FirstUseHintState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const supabase = createClient();
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => [HINT_DISMISSALS_QUERY_KEY, userId] as const, [userId]);

  const dismissals = useQuery({
    queryKey,
    enabled: userId !== null,
    staleTime: Infinity,
    queryFn: async () => {
      // RLS already scopes the read to the caller; the eq() is there so the
      // primary key is used and the intent is on the page.
      const { data, error } = await supabase
        .from("user_hint_dismissals")
        .select("hint_id")
        .eq("user_id", userId);
      if (error) throw error;
      return ((data ?? []) as { hint_id: string }[]).map((r) => r.hint_id);
    },
  });

  const addToCache = useCallback(() => {
    queryClient.setQueryData<string[]>(queryKey, (prev) =>
      prev && prev.includes(id) ? prev : [...(prev ?? []), id]
    );
  }, [id, queryClient, queryKey]);

  const write = useAuthAwareMutation({
    mutationFn: async () => {
      if (userId === null) return;
      // INSERT … ON CONFLICT DO NOTHING: a second dismissal of the same hint
      // (two tabs, a retry) is not an error, and no UPDATE grant is needed.
      const { error } = await supabase
        .from("user_hint_dismissals")
        .upsert({ user_id: userId, hint_id: id }, { onConflict: "user_id,hint_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    // The row now exists, so if a background refetch replaced the cached list
    // while the write was in flight, put the entry back.
    onSuccess: addToCache,
    onError: (e: Error) => {
      console.warn(`[hints] could not record dismissal of ${id}: ${e.message}`);
    },
  });
  const { mutate } = write;

  const dismiss = useCallback(() => {
    if (userId === null) return;
    addToCache();
    mutate(undefined);
  }, [addToCache, mutate, userId]);

  // The cached list already carries this session's optimistic dismissal, so
  // the predicate's separate `dismissedThisSession` input is not needed here.
  const seen = (dismissals.data ?? []).includes(id);
  const loaded = userId !== null && dismissals.isSuccess;
  const visible = shouldShowHint(id, {
    seen,
    loaded,
    hasTiles: opts.hasTiles,
    dismissedThisSession: false,
    canWrite: opts.canWrite,
  });

  return useMemo(() => ({ visible, dismiss }), [visible, dismiss]);
}
