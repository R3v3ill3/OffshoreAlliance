"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";

export type LeaderLink = {
  link_id: number;
  campaign_id: number;
  leader_worker_id: number;
  follower_worker_id: number;
  notes: string | null;
  created_at: string;
  leader: LinkedWorker | null;
  follower: LinkedWorker | null;
};

export type LinkedWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
  member_role_type: { role_name: string; display_name: string } | null;
};

const WORKER_COLUMNS = `worker_id, first_name, last_name,
  member_role_type:member_role_types(role_name, display_name)`;

function normaliseWorker(raw: unknown): LinkedWorker | null {
  const w = (Array.isArray(raw) ? raw[0] : raw) as
    | {
        worker_id: number;
        first_name: string;
        last_name: string;
        member_role_type: unknown;
      }
    | null
    | undefined;
  if (!w) return null;
  const mt = (Array.isArray(w.member_role_type) ? w.member_role_type[0] : w.member_role_type) as
    | { role_name: string; display_name: string }
    | null;
  return {
    worker_id: w.worker_id,
    first_name: w.first_name,
    last_name: w.last_name,
    member_role_type: mt ?? null,
  };
}

export type UseLeaderLinksOptions = {
  campaignId?: string | number;
  workerId: number;
};

/** Links where `workerId` is the follower (i.e. their leaders). */
export function useLeaderLinksAsFollower({ campaignId, workerId }: UseLeaderLinksOptions) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["leader-links", "follower", String(campaignId ?? "all"), workerId],
    queryFn: async () => {
      let q = supabase
        .from("campaign_leader_worker_links")
        .select(
          `link_id, campaign_id, leader_worker_id, follower_worker_id, notes, created_at,
           leader:workers!campaign_leader_worker_links_leader_worker_id_fkey(${WORKER_COLUMNS})`
        )
        .eq("follower_worker_id", workerId);
      if (campaignId != null) q = q.eq("campaign_id", Number(campaignId));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          link_id: r.link_id as number,
          campaign_id: r.campaign_id as number,
          leader_worker_id: r.leader_worker_id as number,
          follower_worker_id: r.follower_worker_id as number,
          notes: (r.notes as string | null) ?? null,
          created_at: r.created_at as string,
          leader: normaliseWorker(r.leader),
          follower: null,
        } satisfies LeaderLink;
      });
    },
  });
}

/** Links where `workerId` is the leader (i.e. their followers). */
export function useLeaderLinksAsLeader({ campaignId, workerId }: UseLeaderLinksOptions) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["leader-links", "leader", String(campaignId ?? "all"), workerId],
    queryFn: async () => {
      let q = supabase
        .from("campaign_leader_worker_links")
        .select(
          `link_id, campaign_id, leader_worker_id, follower_worker_id, notes, created_at,
           follower:workers!campaign_leader_worker_links_follower_worker_id_fkey(${WORKER_COLUMNS})`
        )
        .eq("leader_worker_id", workerId);
      if (campaignId != null) q = q.eq("campaign_id", Number(campaignId));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          link_id: r.link_id as number,
          campaign_id: r.campaign_id as number,
          leader_worker_id: r.leader_worker_id as number,
          follower_worker_id: r.follower_worker_id as number,
          notes: (r.notes as string | null) ?? null,
          created_at: r.created_at as string,
          leader: null,
          follower: normaliseWorker(r.follower),
        } satisfies LeaderLink;
      });
    },
  });
}

/** All links in a campaign (used by the cross-unit overlay). */
export function useAllLeaderLinks(campaignId: string | number | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["leader-links", "campaign", String(campaignId ?? "all")],
    queryFn: async () => {
      if (campaignId == null) return [] as LeaderLink[];
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("link_id, campaign_id, leader_worker_id, follower_worker_id, notes, created_at")
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
      return (data ?? []).map((r) => ({
        link_id: r.link_id as number,
        campaign_id: r.campaign_id as number,
        leader_worker_id: r.leader_worker_id as number,
        follower_worker_id: r.follower_worker_id as number,
        notes: (r.notes as string | null) ?? null,
        created_at: r.created_at as string,
        leader: null,
        follower: null,
      }));
    },
    enabled: campaignId != null,
  });
}

export function useCreateLeaderLink(campaignId: string | number) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (vars: {
      leader_worker_id: number;
      follower_worker_id: number;
      notes?: string | null;
    }) => {
      const { error } = await supabase.from("campaign_leader_worker_links").insert({
        campaign_id: Number(campaignId),
        leader_worker_id: vars.leader_worker_id,
        follower_worker_id: vars.follower_worker_id,
        notes: vars.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader-links"] });
    },
  });
}

export function useBulkCreateLeaderLinks(campaignId: string | number) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (vars: {
      leader_worker_id: number;
      follower_worker_ids: number[];
      notes?: string | null;
    }) => {
      const ids = vars.follower_worker_ids.filter((id) => id !== vars.leader_worker_id);
      if (ids.length === 0) return { inserted: 0 };
      // Skip followers already linked — avoids unique-constraint failures.
      const { data: existing, error: exErr } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", Number(campaignId))
        .eq("leader_worker_id", vars.leader_worker_id)
        .in("follower_worker_id", ids);
      if (exErr) throw exErr;
      const already = new Set((existing ?? []).map((r) => r.follower_worker_id as number));
      const toInsert = ids.filter((id) => !already.has(id));
      if (toInsert.length === 0) return { inserted: 0 };
      const rows = toInsert.map((id) => ({
        campaign_id: Number(campaignId),
        leader_worker_id: vars.leader_worker_id,
        follower_worker_id: id,
        notes: vars.notes ?? null,
      }));
      const { error } = await supabase.from("campaign_leader_worker_links").insert(rows);
      if (error) throw error;
      return { inserted: toInsert.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader-links"] });
    },
  });
}

export function useDeleteLeaderLink() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (linkId: number) => {
      const { error } = await supabase
        .from("campaign_leader_worker_links")
        .delete()
        .eq("link_id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leader-links"] });
    },
  });
}
