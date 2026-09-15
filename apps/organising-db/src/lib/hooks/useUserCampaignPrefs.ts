"use client";

// WP2.4 (PR-a, docs/organiser-ux-review/wp/wp2.4.md §3.11) — the per-user,
// per-campaign wall-chart preferences in `user_campaign_prefs.prefs`.
//
// One document per (user, campaign), owner-only RLS (`ucp_*`), no migration:
// this hook is the first reader and writer of the table. It owns the
// `wallChart` key only; every other key (`compare` for WP2.5, `layout` for
// WP2.6, anything later) is carried through `mergeWallChartPrefs` untouched.
// Shared with WP2.5/2.6, which is why it lives in `lib/hooks`, not the chart.
//
// Read:  `["user-campaign-prefs", campaignId]` →
//        `from("user_campaign_prefs").select("prefs").eq("campaign_id", id).maybeSingle()`
//        (RLS returns only the caller's row; a missing row is `{}`).
// Write: `upsert({ user_id, campaign_id, prefs }, { onConflict: "user_id,campaign_id" })`
//        of the LAST-READ document with the patch merged in, through
//        `useAuthAwareMutation`.
//
// The chart never waits on prefs: every change is applied to an in-memory
// overlay first (so the UI reads it immediately, even before the first read
// has landed), the write is queued until the document is known (so a write
// can never clobber keys it has not seen), filter/sort writes are debounced
// (`PREFS_WRITE_DEBOUNCE_MS`), everything else is written at once, and a
// refused write toasts once and leaves the in-memory state in force. Every
// write sends the WHOLE overlay of this mount merged into the last-read
// document (fix round 1, A1): two concurrent upserts therefore carry the
// same union of changes whatever order they resolve in, and the cache is
// never rewritten from a response. A failed read is surfaced as `isError`
// and one toast, because writes stay queued behind it (A2). Two tabs of one
// user are last-write-wins (§8.2). Nothing here touches browser storage of
// any kind (§3.1 principle 6).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import {
  WALL_CHART_PREFS_KEY,
  mergeWallChartPrefs,
  parseWallChartPrefs,
  type KnownIds,
  type WallChartPrefs,
} from "@/lib/campaign/groups/wall-chart-prefs";

export const USER_CAMPAIGN_PREFS_QUERY_KEY = "user-campaign-prefs";

export function userCampaignPrefsQueryKey(campaignId: string | number) {
  return [USER_CAMPAIGN_PREFS_QUERY_KEY, String(campaignId)] as const;
}

/** Filter and sort changes are coalesced over this window; everything else writes at once. */
export const PREFS_WRITE_DEBOUNCE_MS = 400;

export const PREFS_WRITE_FAILED_MESSAGE =
  "Your wall chart settings could not be saved. They will apply until you leave this page.";

export const PREFS_READ_FAILED_MESSAGE =
  "Your wall chart settings could not be loaded. Changes will apply until you leave this page but will not be saved.";

export type WallChartPrefsPatch = Partial<Omit<WallChartPrefs, "v">>;

export type SetWallChartPrefs = (patch: WallChartPrefsPatch, opts?: { debounce?: boolean }) => void;

export type UseUserCampaignPrefsResult = {
  /** The parsed `wallChart` document, overlay applied; `{ v: 1 }` until the read lands or when nothing is stored. */
  wallChart: WallChartPrefs;
  /** True until the first read has resolved (success or error). */
  isLoading: boolean;
  /** True once the stored document is known (reads and writes are then exact). */
  isLoaded: boolean;
  /** True when the read failed: changes apply in memory but stay queued and are never written (A2). */
  isError: boolean;
  setWallChart: SetWallChartPrefs;
  /** Send any debounced change now (e.g. before navigating away). */
  flush: () => void;
};

type PrefsDocument = Record<string, unknown>;

function isPlainObject(v: unknown): v is PrefsDocument {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function useUserCampaignPrefs(
  campaignId: string | number,
  /** Live ids; a stored id outside them is dropped on read (memoise in the caller). */
  known?: KnownIds
): UseUserCampaignPrefsResult {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const campaignIdNum = Number(campaignId);
  const queryKey = userCampaignPrefsQueryKey(campaignId);
  const userId = user?.id ?? null;

  const query = useQuery<PrefsDocument>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_campaign_prefs")
        .select("prefs")
        .eq("campaign_id", campaignIdNum)
        .maybeSingle();
      if (error) throw error;
      const prefs = (data as { prefs?: unknown } | null)?.prefs;
      return isPlainObject(prefs) ? prefs : {};
    },
    enabled: userId != null && Number.isFinite(campaignIdNum),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // In-memory overlay of every patch made on this mount: read first, never
  // rolled back by a refused write or a later refetch (§3.11). The ref is the
  // same value for the write path (so a flush never reads a stale closure).
  const [overlay, setOverlay] = useState<WallChartPrefsPatch>({});
  const overlayRef = useRef<WallChartPrefsPatch>({});

  const wallChart = useMemo(() => {
    const merged = mergeWallChartPrefs(query.data ?? {}, overlay);
    return parseWallChartPrefs(merged[WALL_CHART_PREFS_KEY], known);
  }, [query.data, overlay, known]);

  const errorToasted = useRef(false);
  const write = useAuthAwareMutation<PrefsDocument, Error, PrefsDocument>({
    mutationFn: async (nextDocument) => {
      if (userId == null) throw new Error("Not signed in");
      const { error } = await supabase
        .from("user_campaign_prefs")
        .upsert(
          { user_id: userId, campaign_id: campaignIdNum, prefs: nextDocument },
          { onConflict: "user_id,campaign_id" }
        );
      if (error) throw error;
      return nextDocument;
    },
    // The cache already holds the optimistic document (set in `flush`); it is
    // deliberately NOT rewritten from the response, so two concurrent upserts
    // resolving out of order cannot regress it (A1).
    onSuccess: () => {
      errorToasted.current = false;
    },
    onError: () => {
      if (errorToasted.current) return;
      errorToasted.current = true;
      toast.error(PREFS_WRITE_FAILED_MESSAGE);
    },
  });
  const mutate = write.mutate;

  // A failed read: nothing is ever written over a document we have not seen,
  // so say so once (A2); `isError` lets the shell say it too.
  const readErrorToasted = useRef(false);
  useEffect(() => {
    if (!query.isError || readErrorToasted.current) return;
    readErrorToasted.current = true;
    toast.error(PREFS_READ_FAILED_MESSAGE);
  }, [query.isError]);

  // Whether anything since the last write is waiting: a debounced batch, or
  // anything made before the stored document was known.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoaded = query.data !== undefined;

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    // Not yet known: stay dirty; the effect below flushes when it lands.
    const base = queryClient.getQueryData<PrefsDocument>(queryKey);
    if (base === undefined) return;
    dirty.current = false;
    // The whole overlay, not only the latest patch: every in-flight upsert then
    // carries the same union, whatever order the responses arrive in (A1).
    const next = mergeWallChartPrefs(base, overlayRef.current);
    queryClient.setQueryData<PrefsDocument>(queryKey, next);
    mutate(next);
    // `queryKey` is derived from `campaignId`; listing the id keeps the deps honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, mutate, String(campaignId)]);

  const setWallChart = useCallback<SetWallChartPrefs>(
    (patch, opts) => {
      overlayRef.current = { ...overlayRef.current, ...patch };
      setOverlay(overlayRef.current);
      dirty.current = true;
      if (opts?.debounce) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, PREFS_WRITE_DEBOUNCE_MS);
      } else {
        flush();
      }
    },
    [flush]
  );

  // A patch made before the read landed is written once the document is known.
  useEffect(() => {
    if (isLoaded && dirty.current && timer.current == null) flush();
  }, [isLoaded, flush]);

  // Leaving the chart (e.g. switching to List) sends a debounced change now.
  useEffect(() => () => flush(), [flush]);

  return {
    wallChart,
    isLoading: query.isLoading,
    isLoaded,
    isError: query.isError,
    setWallChart,
    flush,
  };
}
