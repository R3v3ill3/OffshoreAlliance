"use client";

/**
 * Data hooks for WOC committees, rosters, meetings and unit
 * representation. Query keys are namespaced ("woc-*", "activist-ou-
 * options") and never reuse the canonical ["campaign-ous"] cache.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type {
  CampaignWocRow,
  WocMeetingRow,
  WocMemberRow,
  WocUnitRepresentationRow,
} from "./types";

export type OuOption = {
  ou_id: number;
  name: string;
  parent_ou_id: number | null;
  is_group_container: boolean;
};

export type WocWithRollup = CampaignWocRow & {
  member_count: number;
  scope_unit_count: number;
  represented_unit_count: number;
  scope_extra_ou_ids: number[];
};

export type WocMemberWithWorker = WocMemberRow & {
  workers: { first_name: string; last_name: string } | null;
};

export function useOuOptions(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activist-ou-options", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, parent_ou_id, is_group_container")
        .eq("campaign_id", Number(campaignId))
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ou_id: r.ou_id,
        name: r.name,
        parent_ou_id: r.parent_ou_id,
        is_group_container: !!r.is_group_container,
      })) as OuOption[];
    },
  });
}

export function useWocs(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["wocs", campaignId],
    queryFn: async () => {
      const [wocsRes, membersRes, repRes, scopeRes] = await Promise.all([
        supabase
          .from("campaign_wocs")
          .select("*")
          .eq("campaign_id", Number(campaignId))
          .order("name"),
        supabase
          .from("woc_members")
          .select("woc_id, worker_id, left_on"),
        supabase
          .from("v_woc_unit_representation")
          .select("*")
          .eq("campaign_id", Number(campaignId)),
        supabase.from("woc_scope_units").select("woc_id, ou_id"),
      ]);
      if (wocsRes.error) throw wocsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (repRes.error) throw repRes.error;
      if (scopeRes.error) throw scopeRes.error;

      const wocs = (wocsRes.data ?? []) as CampaignWocRow[];
      const wocIds = new Set(wocs.map((w) => w.woc_id));
      const members = (membersRes.data ?? []).filter(
        (m) => wocIds.has(m.woc_id) && m.left_on == null
      );
      const rep = (repRes.data ?? []) as WocUnitRepresentationRow[];
      const scope = (scopeRes.data ?? []).filter((s) => wocIds.has(s.woc_id));

      return wocs.map<WocWithRollup>((w) => {
        const wocRep = rep.filter((r) => r.woc_id === w.woc_id);
        return {
          ...w,
          member_count: members.filter((m) => m.woc_id === w.woc_id).length,
          scope_unit_count: wocRep.length,
          represented_unit_count: wocRep.filter((r) => r.represented).length,
          scope_extra_ou_ids: scope
            .filter((s) => s.woc_id === w.woc_id)
            .map((s) => s.ou_id),
        };
      });
    },
  });
}

export function useWocRepresentation(campaignId: string, wocId: number | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["woc-representation", campaignId, wocId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_woc_unit_representation")
        .select("*")
        .eq("woc_id", wocId!)
        .order("ou_name");
      if (error) throw error;
      return (data ?? []) as WocUnitRepresentationRow[];
    },
    enabled: wocId != null,
  });
}

export function useWocMembers(wocId: number | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["woc-members", wocId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("woc_members")
        .select("*, workers(first_name, last_name)")
        .eq("woc_id", wocId!)
        .order("joined_on");
      if (error) throw error;
      return (data ?? []) as unknown as WocMemberWithWorker[];
    },
    enabled: wocId != null,
  });
}

export function useWocMeetings(wocId: number | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["woc-meetings", wocId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("woc_committee_meetings")
        .select("*")
        .eq("woc_id", wocId!)
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WocMeetingRow[];
    },
    enabled: wocId != null,
  });
}

export function invalidateWocData(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: string
) {
  queryClient.invalidateQueries({ queryKey: ["wocs", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["woc-members"] });
  queryClient.invalidateQueries({ queryKey: ["woc-meetings"] });
  queryClient.invalidateQueries({ queryKey: ["woc-representation", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["activist-register", campaignId] });
}

export function useSaveWoc(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (args: {
      wocId?: number;
      values: {
        name: string;
        status: string;
        cadence: string | null;
        format: string | null;
        scope_ou_id: number | null;
        notes: string | null;
      };
      extraUnitIds: number[];
    }) => {
      let wocId = args.wocId;
      if (wocId == null) {
        const { data, error } = await supabase
          .from("campaign_wocs")
          .insert({ campaign_id: Number(campaignId), ...args.values })
          .select("woc_id")
          .single();
        if (error) throw error;
        wocId = data.woc_id;
      } else {
        const { error } = await supabase
          .from("campaign_wocs")
          .update(args.values)
          .eq("woc_id", wocId);
        if (error) throw error;
      }
      // Reconcile extra scope units.
      const { error: delError } = await supabase
        .from("woc_scope_units")
        .delete()
        .eq("woc_id", wocId);
      if (delError) throw delError;
      if (args.extraUnitIds.length > 0) {
        const { error: insError } = await supabase.from("woc_scope_units").insert(
          args.extraUnitIds.map((ou_id) => ({ woc_id: wocId!, ou_id }))
        );
        if (insError) throw insError;
      }
      return wocId;
    },
    onSuccess: () => {
      invalidateWocData(queryClient, campaignId);
      toast.success("WOC saved");
    },
    onError: (e: Error) => toast.error(`Failed to save WOC: ${e.message}`),
  });
}

export function useSaveWocMember(campaignId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useAuthAwareMutation({
    mutationFn: async (args: {
      wocId: number;
      workerId: number;
      role: string;
      leave?: boolean;
    }) => {
      if (args.leave) {
        const { error } = await supabase
          .from("woc_members")
          .update({ left_on: new Date().toISOString().slice(0, 10) })
          .eq("woc_id", args.wocId)
          .eq("worker_id", args.workerId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("woc_members").upsert(
        {
          woc_id: args.wocId,
          worker_id: args.workerId,
          woc_role: args.role,
          left_on: null,
        },
        { onConflict: "woc_id,worker_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateWocData(queryClient, campaignId),
    onError: (e: Error) => toast.error(`Failed to update roster: ${e.message}`),
  });
}
