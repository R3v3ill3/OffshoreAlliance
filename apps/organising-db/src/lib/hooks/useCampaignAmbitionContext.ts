"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { STANDALONE_STAGE_NUMBER } from "@/types/planner-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignStagePlanRow = {
  plan_id: number;
  campaign_id: number;
  stage_number: number;
  stage_name: string;
  status: string;
  phase: string | null;
  planned_end_date: string | null;
};

export type AssessableAmbitionRow = {
  ambition_id: number;
  plan_id: number;
  ambition_option_id: number | null;
  custom_text: string | null;
  stage_number: number;
  stage_name: string | null;
  option_text: string | null;
  metric_type: string | null;
  target_value: string | null;
};

export type ActivityAmbitionLinkRow = {
  id: number;
  activity_id: number;
  plan_ambition_id: number;
  is_primary: boolean;
  weight: number;
  plan_ambition: {
    ambition_id: number;
    custom_text: string | null;
    metric_type: string | null;
    target_value: string | null;
    target_unit: string | null;
    ambition_options: { option_text: string | null } | null;
    plan: {
      stage_number: number;
      stage_name: string | null;
    } | null;
  } | null;
};

export function invalidateCampaignAmbitionCaches(
  queryClient: QueryClient,
  campaignId: string | number
) {
  const cid = String(campaignId);
  queryClient.invalidateQueries({ queryKey: ["campaign-ambitions-assessable", cid] });
  queryClient.invalidateQueries({ queryKey: ["campaign-assessments-rated", cid] });
  queryClient.invalidateQueries({ queryKey: ["campaign-activities", cid] });
  queryClient.invalidateQueries({ queryKey: ["campaign-assessment-options", cid] });
  queryClient.invalidateQueries({ queryKey: ["campaign-stage-plans-ambitions", cid] });
}

export async function ensureStandaloneStagePlan(
  supabase: SupabaseClient,
  campaignId: number
): Promise<CampaignStagePlanRow> {
  const { data, error } = await supabase
    .from("campaign_stage_plans")
    .upsert(
      {
        campaign_id: campaignId,
        stage_number: STANDALONE_STAGE_NUMBER,
        stage_name: "Standalone activities",
        status: "active",
        phase: "standalone_activities",
      },
      { onConflict: "campaign_id,stage_number" }
    )
    .select("plan_id, campaign_id, stage_number, stage_name, status, phase, planned_end_date")
    .single();
  if (error) throw error;
  return data as CampaignStagePlanRow;
}

export async function fetchAssessableAmbitions(
  supabase: SupabaseClient,
  campaignId: string | number
): Promise<AssessableAmbitionRow[]> {
  const { data, error } = await supabase
    .from("plan_ambitions")
    .select(
      `ambition_id, plan_id, ambition_option_id, custom_text, metric_type, target_value, ambition_scope,
       plan:campaign_stage_plans!inner(stage_number, stage_name, campaign_id),
       ambition_options(option_text)`
    )
    .eq("plan.campaign_id", Number(campaignId))
    .eq("ambition_scope", "worker_assessable")
    .order("plan_id");
  if (error) throw error;

  type Raw = {
    ambition_id: number;
    plan_id: number;
    ambition_option_id: number | null;
    custom_text: string | null;
    metric_type: string | null;
    target_value: string | null;
    plan:
      | { stage_number: number; stage_name: string | null }
      | { stage_number: number; stage_name: string | null }[]
      | null;
    ambition_options:
      | { option_text: string | null }
      | { option_text: string | null }[]
      | null;
  };

  return ((data ?? []) as Raw[]).map((r) => {
    const plan = Array.isArray(r.plan) ? r.plan[0] : r.plan;
    const opt = Array.isArray(r.ambition_options)
      ? r.ambition_options[0]
      : r.ambition_options;
    return {
      ambition_id: r.ambition_id,
      plan_id: r.plan_id,
      ambition_option_id: r.ambition_option_id ?? null,
      custom_text: r.custom_text,
      metric_type: r.metric_type,
      target_value: r.target_value,
      stage_number: plan?.stage_number ?? 0,
      stage_name: plan?.stage_name ?? null,
      option_text: opt?.option_text ?? null,
    };
  });
}

function pickDefaultPlanId(plans: CampaignStagePlanRow[]): number | null {
  const canonical = plans.filter((p) => p.stage_number > STANDALONE_STAGE_NUMBER);
  const active = canonical.filter((p) => p.status === "active");
  const pool = active.length > 0 ? active : canonical;
  if (pool.length === 0) {
    const standalone = plans.find((p) => p.stage_number === STANDALONE_STAGE_NUMBER);
    return standalone?.plan_id ?? null;
  }
  const best = pool.reduce((a, b) => (a.stage_number >= b.stage_number ? a : b));
  return best.plan_id;
}

export function useCampaignStagePlansForAmbitions(campaignId: string, enabled = true) {
  const supabase = createClient();
  const numericId = Number(campaignId);

  return useQuery({
    queryKey: ["campaign-stage-plans-ambitions", campaignId],
    queryFn: async () => {
      await ensureStandaloneStagePlan(supabase, numericId);
      const { data, error } = await supabase
        .from("campaign_stage_plans")
        .select("plan_id, campaign_id, stage_number, stage_name, status, phase, planned_end_date")
        .eq("campaign_id", numericId)
        .order("stage_number");
      if (error) throw error;
      const plans = (data ?? []) as CampaignStagePlanRow[];
      return {
        plans,
        defaultPlanId: pickDefaultPlanId(plans),
        standalonePlan: plans.find((p) => p.stage_number === STANDALONE_STAGE_NUMBER) ?? null,
      };
    },
    enabled: enabled && !!campaignId && !Number.isNaN(numericId),
  });
}

export function useAssessableAmbitions(campaignId: string, enabled = true) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["campaign-ambitions-assessable", campaignId],
    queryFn: () => fetchAssessableAmbitions(supabase, campaignId),
    enabled: enabled && !!campaignId,
  });
}

export function useActivityAmbitionLinks(activityId: number | null) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["activity-ambition-links", activityId],
    queryFn: async (): Promise<ActivityAmbitionLinkRow[]> => {
      if (!activityId) return [];
      const { data, error } = await supabase
        .from("activity_ambitions")
        .select(
          `id, activity_id, plan_ambition_id, is_primary, weight,
           plan_ambition:plan_ambitions(
             ambition_id, custom_text, metric_type, target_value, target_unit,
             ambition_options(option_text),
             plan:campaign_stage_plans(stage_number, stage_name)
           )`
        )
        .eq("activity_id", activityId);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const rawPa = row.plan_ambition;
        const pa = (Array.isArray(rawPa) ? rawPa[0] : rawPa) as Record<string, unknown> | null;
        if (!pa) {
          return {
            id: row.id as number,
            activity_id: row.activity_id as number,
            plan_ambition_id: row.plan_ambition_id as number,
            is_primary: row.is_primary as boolean,
            weight: row.weight as number,
            plan_ambition: null,
          };
        }
        const rawOpt = pa.ambition_options;
        const opt = Array.isArray(rawOpt) ? rawOpt[0] : rawOpt;
        const rawPlan = pa.plan;
        const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
        return {
          id: row.id as number,
          activity_id: row.activity_id as number,
          plan_ambition_id: row.plan_ambition_id as number,
          is_primary: row.is_primary as boolean,
          weight: row.weight as number,
          plan_ambition: {
            ambition_id: pa.ambition_id as number,
            custom_text: (pa.custom_text as string | null) ?? null,
            metric_type: (pa.metric_type as string | null) ?? null,
            target_value: (pa.target_value as string | null) ?? null,
            target_unit: (pa.target_unit as string | null) ?? null,
            ambition_options: opt
              ? { option_text: (opt as { option_text: string | null }).option_text ?? null }
              : null,
            plan: plan
              ? {
                  stage_number: (plan as { stage_number: number }).stage_number,
                  stage_name: (plan as { stage_name: string | null }).stage_name ?? null,
                }
              : null,
          },
        };
      });
    },
    enabled: activityId != null,
  });
}

export type SaveActivityAmbitionLinksInput = {
  activityId: number;
  campaignId: string;
  selectedAmbitionIds: number[];
  primaryAmbitionId: number | null;
};

export function useSaveActivityAmbitionLinks() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useAuthAwareMutation({
    mutationFn: async ({
      activityId,
      selectedAmbitionIds,
      primaryAmbitionId,
    }: SaveActivityAmbitionLinksInput) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("activity_ambitions")
        .select("id, plan_ambition_id")
        .eq("activity_id", activityId);
      if (fetchErr) throw fetchErr;

      const existingRows = existing ?? [];
      const selectedSet = new Set(selectedAmbitionIds);
      const toDelete = existingRows.filter((r) => !selectedSet.has(r.plan_ambition_id));

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("activity_ambitions")
          .delete()
          .in(
            "id",
            toDelete.map((r) => r.id)
          );
        if (delErr) throw delErr;
      }

      const effectivePrimary =
        selectedAmbitionIds.length === 1
          ? selectedAmbitionIds[0]
          : primaryAmbitionId != null && selectedSet.has(primaryAmbitionId)
            ? primaryAmbitionId
            : selectedAmbitionIds[0] ?? null;

      for (const plan_ambition_id of selectedAmbitionIds) {
        const is_primary = effectivePrimary === plan_ambition_id;
        const existingLink = existingRows.find((r) => r.plan_ambition_id === plan_ambition_id);
        if (existingLink) {
          const { error: upErr } = await supabase
            .from("activity_ambitions")
            .update({ is_primary, weight: 1.0 })
            .eq("id", existingLink.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase.from("activity_ambitions").insert({
            activity_id: activityId,
            plan_ambition_id,
            is_primary,
            weight: 1.0,
          });
          if (insErr) throw insErr;
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["activity-ambition-links", variables.activityId],
      });
      invalidateCampaignAmbitionCaches(queryClient, variables.campaignId);
    },
  });
}
