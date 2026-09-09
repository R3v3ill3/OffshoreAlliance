"use client";

// WP1.3 — the My campaigns queries. Fetching only: every decision is in
// `@/lib/campaign/my-campaigns` (grouping), `my-campaign-metrics` (numbers
// and the last-activity line) and `needs-attention` (the list), all pure and
// tested. Keys are all rooted at `['my-campaigns', …]`.
//
// Round trips for a plain organiser: Q1 roster → Q2 campaigns (sequential:
// Q2's filter is built from Q1). A lead adds Q0 (their reports) in front.
// Every SELECT below is already read-all for `authenticated` in the baseline;
// no RLS policy is touched.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns";
import {
  groupMyCampaigns,
  type GroupedMyCampaigns,
  type MyCampaignRosterRow,
  type MyCampaignRow,
} from "@/lib/campaign/my-campaigns";
import { isLastActivityKind, type LastActivityKind } from "@/lib/campaign/my-campaign-metrics";
import type { EmailResumeRow, PhoneResumeRow } from "@/lib/campaign/resume-links";

export const MY_CAMPAIGNS_QUERY_ROOT = "my-campaigns";
/** The pending-review key `pending-review-tab.tsx`'s `invalidate()` also fires (R6). */
export const MY_CAMPAIGNS_PENDING_REVIEW_KEY = [MY_CAMPAIGNS_QUERY_ROOT, "pending-review"] as const;

const STALE_MS = 60_000;

function idsKey(ids: readonly number[]): string {
  return [...ids].sort((a, b) => a - b).join(",");
}

interface ReportRow {
  user_id: string;
  organiser_id: number;
  display_name: string;
}

export interface UseMyCampaignsResult extends GroupedMyCampaigns {
  /** True once the campaigns query has settled (success or error), so the auto-open never fires against an empty list. */
  resolved: boolean;
  isLoading: boolean;
  error: Error | null;
  myOrganiserId: number | null;
  /** The lead's reports (Q0), keyed by organiser_id, for the team row's names. */
  reportNamesByOrganiserId: ReadonlyMap<number, string>;
}

export function useMyCampaigns(): UseMyCampaignsResult {
  const supabase = createClient();
  const { user, profile, isLeadOrganiser, loading: authLoading } = useAuth();
  const myOrganiserId = profile?.organiser_id ?? null;
  const userId = user?.id ?? null;

  // Q0 — lead only: the organiser ids of everyone who reports to me.
  const reportsQuery = useQuery({
    queryKey: [MY_CAMPAIGNS_QUERY_ROOT, "reports", userId],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, organiser_id, display_name")
        .eq("reports_to", userId)
        .not("organiser_id", "is", null);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
    enabled: !!userId && isLeadOrganiser,
    staleTime: STALE_MS,
  });
  const reportOrganiserIds = useMemo(
    () => (isLeadOrganiser ? (reportsQuery.data ?? []).map((r) => r.organiser_id) : []),
    [isLeadOrganiser, reportsQuery.data]
  );
  const reportNamesByOrganiserId = useMemo(
    () => new Map((reportsQuery.data ?? []).map((r) => [r.organiser_id, r.display_name])),
    [reportsQuery.data]
  );
  const reportsSettled = !isLeadOrganiser || reportsQuery.isSuccess || reportsQuery.isError;

  // Q1 — roster rows for me and my reports.
  const rosterOrganiserIds = useMemo(
    () => (myOrganiserId == null ? [] : [myOrganiserId, ...reportOrganiserIds]),
    [myOrganiserId, reportOrganiserIds]
  );
  const rosterQuery = useQuery({
    queryKey: [MY_CAMPAIGNS_QUERY_ROOT, "roster", idsKey(rosterOrganiserIds)],
    queryFn: async (): Promise<MyCampaignRosterRow[]> => {
      const { data, error } = await supabase
        .from("campaign_organisers")
        .select("campaign_id, organiser_id, campaign_role")
        .in("organiser_id", rosterOrganiserIds);
      if (error) throw error;
      return (data ?? []) as MyCampaignRosterRow[];
    },
    enabled: rosterOrganiserIds.length > 0 && reportsSettled,
    staleTime: STALE_MS,
  });

  // Q2 — the campaigns themselves: owned by me/my reports, or on the roster.
  const rosterCampaignIds = useMemo(
    () => [...new Set((rosterQuery.data ?? []).map((r) => r.campaign_id))],
    [rosterQuery.data]
  );
  const campaignsQuery = useQuery({
    queryKey: [
      MY_CAMPAIGNS_QUERY_ROOT,
      "campaigns",
      idsKey(rosterOrganiserIds),
      idsKey(rosterCampaignIds),
    ],
    queryFn: async (): Promise<MyCampaignRow[]> => {
      const orgIds = rosterOrganiserIds.join(",");
      const filter =
        rosterCampaignIds.length > 0
          ? `organiser_id.in.(${orgIds}),campaign_id.in.(${rosterCampaignIds.join(",")})`
          : `organiser_id.in.(${orgIds})`;
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from("campaigns")
          .select(
            "campaign_id, name, campaign_type, status, is_standing, is_sms_episode, start_date, end_date, total_worker_estimate, organiser_id, created_at, archived_at"
          )
          .or(filter)
      );
      if (error) throw error;
      return (data ?? []) as unknown as MyCampaignRow[];
    },
    enabled: rosterOrganiserIds.length > 0 && rosterQuery.isSuccess,
    staleTime: STALE_MS,
  });

  const grouped = useMemo(
    () =>
      groupMyCampaigns({
        campaigns: campaignsQuery.data ?? [],
        rosterRows: rosterQuery.data ?? [],
        myOrganiserId,
        reportOrganiserIds,
      }),
    [campaignsQuery.data, rosterQuery.data, myOrganiserId, reportOrganiserIds]
  );

  // An unlinked profile resolves immediately (G7): there is nothing to fetch.
  const resolved =
    !authLoading &&
    (myOrganiserId == null ||
      campaignsQuery.isSuccess ||
      campaignsQuery.isError ||
      rosterQuery.isError ||
      reportsQuery.isError);
  const isLoading = !resolved;
  const error =
    (reportsQuery.error as Error | null) ??
    (rosterQuery.error as Error | null) ??
    (campaignsQuery.error as Error | null) ??
    null;

  return {
    ...grouped,
    resolved,
    isLoading,
    error,
    myOrganiserId,
    reportNamesByOrganiserId,
  };
}

export interface CampaignLastActivity {
  at: string | null;
  kind: LastActivityKind | null;
}

/**
 * One round trip for every card: `campaign_last_activity(p_campaign_ids)`
 * (migration 20260910090000). Not awaited by the card's first paint.
 *
 * `createClient()` returns an untyped `SupabaseClient`, so this rpc() call
 * typechecks before `packages/db-types/generated.ts` gains the entry (the
 * verifier regenerates types from dev after applying the migration).
 */
export function useCampaignLastActivity(campaignIds: readonly number[]) {
  const supabase = createClient();
  const key = idsKey(campaignIds);
  return useQuery({
    queryKey: [MY_CAMPAIGNS_QUERY_ROOT, "last-activity", key],
    queryFn: async (): Promise<ReadonlyMap<number, CampaignLastActivity>> => {
      const { data, error } = await supabase.rpc("campaign_last_activity", {
        p_campaign_ids: [...campaignIds],
      });
      if (error) throw error;
      const rows = (data ?? []) as {
        campaign_id: number;
        last_activity_at: string | null;
        last_activity_kind: string | null;
      }[];
      const map = new Map<number, CampaignLastActivity>();
      for (const r of rows) {
        map.set(r.campaign_id, {
          at: r.last_activity_at,
          kind: isLastActivityKind(r.last_activity_kind) ? r.last_activity_kind : null,
        });
      }
      return map;
    },
    enabled: campaignIds.length > 0,
    staleTime: STALE_MS,
  });
}

export interface NeedsAttentionSources {
  pendingReview: { campaign_id: number }[];
  phoneActions: PhoneResumeRow[];
  emailDrafts: (EmailResumeRow & { subject: string | null })[];
}

/**
 * The three cheap Needs-attention sources, one multi-campaign query each,
 * modelled on `pending-review-widget.tsx`, `ResumeBanner.tsx` and
 * `EmailResumeBanner.tsx`. Role check is NOT here: it has no count endpoint
 * and is probed per campaign, deferred, by `RoleCheckProbe`.
 */
export function useNeedsAttentionSources(campaignIds: readonly number[]) {
  const supabase = createClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const key = idsKey(campaignIds);
  const enabled = !!userId && campaignIds.length > 0;
  const ids = [...campaignIds];

  const pendingReview = useQuery({
    queryKey: [...MY_CAMPAIGNS_PENDING_REVIEW_KEY, key],
    queryFn: async (): Promise<{ campaign_id: number }[]> => {
      const { data, error } = await supabase
        .from("campaign_prospective_workers")
        .select("prospective_id, campaign_id")
        .eq("review_status", "pending")
        .in("campaign_id", ids);
      if (error) throw error;
      return (data ?? []) as { campaign_id: number }[];
    },
    enabled,
    staleTime: STALE_MS,
  });

  const phoneActions = useQuery({
    queryKey: [MY_CAMPAIGNS_QUERY_ROOT, "phone-resume", userId, key],
    queryFn: async (): Promise<PhoneResumeRow[]> => {
      const { data, error } = await supabase
        .from("phone_call_actions")
        .select("action_id, campaign_id, entry_branch, script_id, list_ids, created_at")
        .in("campaign_id", ids)
        .eq("created_by", userId)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PhoneResumeRow[];
    },
    enabled,
    staleTime: STALE_MS,
  });

  const emailDrafts = useQuery({
    queryKey: [MY_CAMPAIGNS_QUERY_ROOT, "email-resume", userId, key],
    queryFn: async (): Promise<(EmailResumeRow & { subject: string | null })[]> => {
      const { data, error } = await supabase
        .from("campaign_comms_drafts")
        .select("draft_id, campaign_id, entry_branch, email_list_id, subject, created_at")
        .in("campaign_id", ids)
        .eq("created_by", userId)
        .eq("platform", "email")
        .eq("status", "draft")
        .not("entry_branch", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (EmailResumeRow & { subject: string | null })[];
    },
    enabled,
    staleTime: STALE_MS,
  });

  return {
    pendingReview: pendingReview.data ?? [],
    phoneActions: phoneActions.data ?? [],
    emailDrafts: emailDrafts.data ?? [],
  } satisfies NeedsAttentionSources;
}
