"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation, withSessionGuard } from "@/lib/hooks/useAuthAwareMutation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import type {
  CampaignScopeType,
  CampaignStatus,
  CampaignType,
  EnterpriseAgreementSubtype,
} from "@/types/database";
import { CAMPAIGN_SCOPE_LABELS, EA_SUBTYPE_LABELS } from "@/lib/campaign/constants";
import {
  campaignOrganiserPickerValueForUser,
  resolveCampaignOrganiserId,
} from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import { StepEmployersWorksites } from "@/components/campaigns/step-employers-worksites";
import {
  StepAllocateWorkers,
  type WorkerUnitAllocation,
} from "@/components/campaigns/step-allocate-workers";
import {
  StepAgreements,
  type CampaignAgreementSelection,
} from "@/components/campaigns/step-agreements";
import { StepWorkerEstimate } from "@/components/campaigns/step-worker-estimate";
import {
  StepCampaignUnits,
  type CampaignUnitDraft,
} from "@/components/campaigns/step-campaign-units";
import {
  StepCampaignAmbitions,
  type CampaignAmbitionDraft,
} from "@/components/campaigns/step-campaign-ambitions";
import type {
  CampaignAmbitionCategory,
  CampaignOuType,
  CampaignOuUnitBasis,
} from "@/types/database";
import Link from "next/link";

const SCOPES: CampaignScopeType[] = [
  "single_employer_single_site",
  "single_employer_multi_site",
  "multi_employer_single_site",
  "multi_employer_multi_site",
];

function formatDateForInput(d: string | null | undefined): string {
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Resolves the start_date + plan_timeframe inputs into the values we persist
 * to campaigns: end_date (for tooling that still needs a hard date) and
 * plan_timeframe_weeks (the durable representation).
 *
 * - mode="weeks":   weeks input → plan_timeframe_weeks = N, end_date = start_date + N*7 days
 * - mode="months":  months input → plan_timeframe_weeks = M*4, end_date = start_date + M*4*7 days
 * - mode="custom":  uses basics.end_date directly, plan_timeframe_weeks = null
 */
function computePlanTimeframe(basics: {
  start_date: string;
  end_date: string;
  plan_timeframe_mode: "weeks" | "months" | "custom";
  plan_timeframe_weeks: string;
}): { weeks: number | null; endDate: string | null } {
  if (basics.plan_timeframe_mode === "custom") {
    return { weeks: null, endDate: basics.end_date || null };
  }
  const raw = Number(basics.plan_timeframe_weeks);
  if (!basics.plan_timeframe_weeks || Number.isNaN(raw) || raw <= 0) {
    return { weeks: null, endDate: null };
  }
  const weeks = basics.plan_timeframe_mode === "months" ? raw * 4 : raw;
  if (!basics.start_date) {
    return { weeks, endDate: null };
  }
  const start = new Date(`${basics.start_date}T12:00:00`);
  const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return { weeks, endDate: `${yyyy}-${mm}-${dd}` };
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function CampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite, isAdmin, profile, loading: authLoading } = useAuth();
  const permissionDeniedLoggedForUser = useRef<string | null>(null);
  const basicsHydratedFor = useRef<number | null>(null);
  const scopeHydratedFor = useRef<number | null>(null);

  useEffect(() => {
    if (authLoading || !user || canWrite) return;
    if (permissionDeniedLoggedForUser.current === user.id) return;
    permissionDeniedLoggedForUser.current = user.id;
    console.warn("[CampaignWizard] Signed in but canWrite is false", {
      userId: user.id,
      role: profile?.role ?? null,
      authLoading,
    });
  }, [user, canWrite, profile?.role, authLoading]);

  const initialCid = searchParams.get("cid");
  const editMode = searchParams.get("edit") === "1";
  const [basicsHydrated, setBasicsHydrated] = useState(() => !editMode);
  const [step, setStep] = useState(() => {
    if (!initialCid) return 1;
    if (editMode) return 1;
    return 2;
  });
  const [campaignId, setCampaignId] = useState<number | null>(
    initialCid ? Number(initialCid) || null : null
  );

  useEffect(() => {
    scopeHydratedFor.current = null;
    basicsHydratedFor.current = null;
    setBasicsHydrated(!editMode);
  }, [campaignId, editMode]);

  const [basics, setBasics] = useState({
    name: "",
    description: "",
    campaign_type: "bargaining" as CampaignType,
    enterprise_agreement_subtype: "" as "" | EnterpriseAgreementSubtype,
    replaced_agreement_id: null as number | null,
    status: "planning" as CampaignStatus,
    start_date: "",
    end_date: "",
    plan_timeframe_mode: "weeks" as "weeks" | "months" | "custom",
    plan_timeframe_weeks: "" as string,
    organiser_id: "",
    notes: "",
    campaign_scope: "" as "" | CampaignScopeType,
    total_worker_estimate: "",
    sector_wide: false,
  });

  const [selectedEmployers, setSelectedEmployers] = useState<number[]>([]);
  const [selectedWorksites, setSelectedWorksites] = useState<number[]>([]);
  const [worksiteSectorWide, setWorksiteSectorWide] = useState(false);
  const [agreementSelections, setAgreementSelections] = useState<
    CampaignAgreementSelection[]
  >([]);
  const [units, setUnits] = useState<CampaignUnitDraft[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);
  const [workerUnitAllocations, setWorkerUnitAllocations] =
    useState<WorkerUnitAllocation>({});
  const [campaignAmbitions, setCampaignAmbitions] = useState<
    CampaignAmbitionDraft[]
  >([]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: existingCampaign, isPending: existingCampaignLoading } = useQuery({
    queryKey: ["campaign-wizard", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("campaign_id", campaignId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!campaignId,
  });

  const { data: wizardScope, isPending: wizardScopeLoading } = useQuery({
    queryKey: ["campaign-wizard-scope", campaignId],
    queryFn: async () => {
      const cid = campaignId!;
      const [ce, cw, cw2, ca, cou, cwo, cam] = await Promise.all([
        supabase.from("campaign_employers").select("employer_id").eq("campaign_id", cid),
        supabase.from("campaign_worksites").select("worksite_id, sector_wide").eq("campaign_id", cid),
        supabase.from("campaign_worker_membership").select("worker_id").eq("campaign_id", cid),
        supabase
          .from("campaign_agreements")
          .select("agreement_id, relationship_type, is_primary, sort_order")
          .eq("campaign_id", cid)
          .order("sort_order", { ascending: true }),
        supabase
          .from("campaign_organising_units")
          .select("ou_id, ou_type, name, total_workers_estimated, unit_basis")
          .eq("campaign_id", cid)
          .order("display_order", { ascending: true }),
        supabase
          .from("campaign_worker_ou")
          .select("ou_id, worker_id, campaign_organising_units!inner(campaign_id)")
          .eq("campaign_organising_units.campaign_id", cid),
        supabase
          .from("campaign_ambitions")
          .select(
            "campaign_ambition_id, category, subcategory, label, target_value, target_value_max, target_unit, target_date, notes, sort_order"
          )
          .eq("campaign_id", cid)
          .order("sort_order", { ascending: true }),
      ]);
      if (ce.error) throw ce.error;
      if (cw.error) throw cw.error;
      if (cw2.error) throw cw2.error;
      // The Phase 1–3 tables may not exist on environments where the migrations
      // haven't been applied yet — degrade gracefully rather than failing.
      const agreementRows = ca.error ? [] : (ca.data ?? []);
      const ouRows = cou.error ? [] : (cou.data ?? []);
      const cwoRows = cwo.error ? [] : (cwo.data ?? []);
      const camRows = cam.error ? [] : (cam.data ?? []);
      const worksiteRows = cw.data ?? [];
      const sectorWide = worksiteRows.some((w) => w.sector_wide && w.worksite_id == null);
      return {
        employers: (ce.data ?? []).map((r) => r.employer_id),
        sectorWide,
        worksites: worksiteRows.filter((w) => w.worksite_id != null).map((w) => w.worksite_id!),
        workers: (cw2.data ?? []).map((r) => r.worker_id),
        agreements: (agreementRows as Array<{
          agreement_id: number;
          relationship_type: string;
          is_primary: boolean;
          sort_order: number;
        }>).map((r) => ({
          agreement_id: r.agreement_id,
          relationship_type: r.relationship_type as CampaignAgreementSelection["relationship_type"],
          is_primary: r.is_primary,
        })),
        units: (ouRows as Array<{
          ou_id: number;
          ou_type: string;
          name: string;
          total_workers_estimated: number | null;
          unit_basis: CampaignOuUnitBasis | null;
        }>).map((r) => ({
          draft_id: `srv_${r.ou_id}`,
          ou_id: r.ou_id,
          ou_type: r.ou_type as CampaignOuType,
          name: r.name,
          total_workers_estimated: r.total_workers_estimated,
          unit_basis: r.unit_basis,
        })) satisfies CampaignUnitDraft[],
        workerUnitAllocations: (() => {
          const out: WorkerUnitAllocation = {};
          for (const row of cwoRows as Array<{ ou_id: number; worker_id: number }>) {
            const set = out[row.worker_id] ?? new Set<number>();
            set.add(row.ou_id);
            out[row.worker_id] = set;
          }
          return out;
        })(),
        campaignAmbitions: (camRows as Array<{
          campaign_ambition_id: number;
          category: string;
          subcategory: string | null;
          label: string;
          target_value: string | null;
          target_value_max: string | null;
          target_unit: string | null;
          target_date: string | null;
          notes: string | null;
          sort_order: number;
        }>).map((r) => ({
          draft_id: `srv_${r.campaign_ambition_id}`,
          campaign_ambition_id: r.campaign_ambition_id,
          category: r.category as CampaignAmbitionCategory,
          subcategory: r.subcategory,
          label: r.label,
          target_value: r.target_value ?? "",
          target_value_max: r.target_value_max ?? "",
          target_unit: r.target_unit ?? "",
          target_date: r.target_date ?? "",
          notes: r.notes ?? "",
        })) satisfies CampaignAmbitionDraft[],
      };
    },
    enabled: !!user && !!campaignId,
  });

  useEffect(() => {
    if (!editMode || !campaignId || !existingCampaign) return;
    if (basicsHydratedFor.current === campaignId) return;

    let cancelled = false;
    (async () => {
      let organiser = "";
      if (existingCampaign.organiser_id != null) {
        const { data } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("organiser_id", existingCampaign.organiser_id)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        organiser = data?.user_id
          ? campaignOrganiserPickerValueForUser(data.user_id as string)
          : String(existingCampaign.organiser_id);
      }

      const row = existingCampaign;
      const planTimeframeWeeks =
        (row as { plan_timeframe_weeks?: number | null }).plan_timeframe_weeks ?? null;
      const hasEndDate = !!row.end_date;
      const inferredMode: "weeks" | "months" | "custom" =
        planTimeframeWeeks != null
          ? planTimeframeWeeks % 4 === 0
            ? "months"
            : "weeks"
          : hasEndDate
          ? "custom"
          : "weeks";
      setBasics({
        name: row.name ?? "",
        description: row.description ?? "",
        campaign_type: (row.campaign_type as CampaignType) ?? "bargaining",
        enterprise_agreement_subtype:
          (row.enterprise_agreement_subtype as EnterpriseAgreementSubtype | null) ?? "",
        replaced_agreement_id: row.replaced_agreement_id ?? null,
        status: (row.status as CampaignStatus) ?? "planning",
        start_date: formatDateForInput(row.start_date),
        end_date: formatDateForInput(row.end_date),
        plan_timeframe_mode: inferredMode,
        plan_timeframe_weeks:
          planTimeframeWeeks != null
            ? inferredMode === "months"
              ? String(planTimeframeWeeks / 4)
              : String(planTimeframeWeeks)
            : "",
        organiser_id: organiser,
        notes: row.notes ?? "",
        campaign_scope: (row.campaign_scope as CampaignScopeType | null) ?? "",
        total_worker_estimate:
          row.total_worker_estimate != null ? String(row.total_worker_estimate) : "",
        sector_wide: row.sector_wide ?? false,
      });
      basicsHydratedFor.current = campaignId;
      setBasicsHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [editMode, campaignId, existingCampaign, supabase]);

  useEffect(() => {
    if (!campaignId || wizardScopeLoading || !wizardScope) return;
    if (scopeHydratedFor.current === campaignId) return;
    setSelectedEmployers(wizardScope.employers);
    setWorksiteSectorWide(wizardScope.sectorWide);
    setSelectedWorksites(wizardScope.worksites);
    setSelectedWorkers(wizardScope.workers);
    setAgreementSelections(wizardScope.agreements);
    setUnits(wizardScope.units);
    setWorkerUnitAllocations(wizardScope.workerUnitAllocations);
    setCampaignAmbitions(wizardScope.campaignAmbitions);
    scopeHydratedFor.current = campaignId;
  }, [campaignId, wizardScopeLoading, wizardScope]);

  // EA employers for the replaced agreement — used when auto-linking on save
  const { data: eaEmployerIds = [] } = useQuery<number[]>({
    queryKey: ["ea-employers", basics.replaced_agreement_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("agreement_employers")
        .select("employer_id")
        .eq("agreement_id", basics.replaced_agreement_id!);
      return (data ?? []).map((r) => r.employer_id);
    },
    enabled: !!user && !!basics.replaced_agreement_id,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const computedTimeframe = computePlanTimeframe(basics);

  const createCampaignMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");

      const resolvedOrganiserId = await resolveCampaignOrganiserId(supabase, basics.organiser_id, {
        currentUserId: user.id,
        isAdmin,
      });

      const payload: Record<string, unknown> = {
        name: basics.name,
        campaign_type: basics.campaign_type,
        status: basics.status,
        sector_wide: basics.sector_wide,
      };
      if (basics.description) payload.description = basics.description;
      if (basics.start_date) payload.start_date = basics.start_date;
      if (computedTimeframe.endDate) payload.end_date = computedTimeframe.endDate;
      if (computedTimeframe.weeks != null) {
        payload.plan_timeframe_weeks = computedTimeframe.weeks;
      }
      if (resolvedOrganiserId != null) payload.organiser_id = resolvedOrganiserId;
      if (basics.notes) payload.notes = basics.notes;
      if (basics.campaign_scope) payload.campaign_scope = basics.campaign_scope;
      if (basics.enterprise_agreement_subtype) {
        payload.enterprise_agreement_subtype = basics.enterprise_agreement_subtype;
      }
      // replaced_agreement_id is deprecated as a primary write target — Step 3
      // (StepAgreements) writes campaign_agreements, and a DB trigger keeps the
      // legacy column mirrored. Setting it here would be redundant.

      const { data, error } = await supabase
        .from("campaigns")
        .insert(payload)
        .select("campaign_id")
        .single();
      if (error) throw error;
      return data.campaign_id as number;
    },
    onSuccess: (id) => {
      setCampaignId(id);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["organisers"] });
      queryClient.invalidateQueries({ queryKey: ["user-profiles-staff-organiser-picker"] });
      router.replace(`/campaigns/new?cid=${id}`);
      setStep(2);
    },
  });

  const updateCampaignMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user || !campaignId) throw new Error("Not signed in or no campaign");

      const resolvedOrganiserId = await resolveCampaignOrganiserId(supabase, basics.organiser_id, {
        currentUserId: user.id,
        isAdmin,
      });

      const payload: Record<string, unknown> = {
        name: basics.name,
        campaign_type: basics.campaign_type,
        status: basics.status,
        sector_wide: basics.sector_wide,
        description: basics.description ?? null,
        start_date: basics.start_date || null,
        end_date: computedTimeframe.endDate ?? null,
        plan_timeframe_weeks: computedTimeframe.weeks,
        organiser_id: resolvedOrganiserId,
        notes: basics.notes || null,
        campaign_scope: basics.campaign_scope || null,
        enterprise_agreement_subtype: basics.enterprise_agreement_subtype || null,
        // Worker estimate is no longer set from Step 1; Step 4 owns it. We do not
        // null it out on edits saved from Step 1 (preserve whatever Step 4 wrote).
      };

      const { error } = await supabase.from("campaigns").update(payload).eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard-scope", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["organisers"] });
      queryClient.invalidateQueries({ queryKey: ["user-profiles-staff-organiser-picker"] });
      if (editMode) {
        router.push(`/campaigns/${campaignId}`);
      } else {
        setStep(2);
      }
    },
  });

  const saveScopeMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      await withSessionGuard("saveScopeMutation", async () => {
        await supabase.from("campaign_employers").delete().eq("campaign_id", campaignId);
        await supabase.from("campaign_worksites").delete().eq("campaign_id", campaignId);

        if (selectedEmployers.length > 0) {
          const { error } = await supabase.from("campaign_employers").insert(
            selectedEmployers.map((employer_id) => ({ campaign_id: campaignId, employer_id }))
          );
          if (error) throw error;

          if (basics.replaced_agreement_id && eaEmployerIds.length >= 0) {
            const eaSet = new Set(eaEmployerIds);
            const toLink = selectedEmployers.filter((id) => !eaSet.has(id));
            if (toLink.length > 0) {
              await supabase.from("agreement_employers").upsert(
                toLink.map((employer_id) => ({
                  agreement_id: basics.replaced_agreement_id!,
                  employer_id,
                  is_primary: false,
                })),
                { onConflict: "agreement_id,employer_id", ignoreDuplicates: true }
              );
            }
          }
        }

        if (worksiteSectorWide) {
          const { error } = await supabase.from("campaign_worksites").insert({
            campaign_id: campaignId,
            worksite_id: null,
            sector_wide: true,
          });
          if (error) throw error;
        } else if (selectedWorksites.length > 0) {
          const { error } = await supabase.from("campaign_worksites").insert(
            selectedWorksites.map((worksite_id) => ({
              campaign_id: campaignId,
              worksite_id,
              sector_wide: false,
            }))
          );
          if (error) throw error;
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      setStep(3);
    },
  });

  const saveAgreementsMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      await withSessionGuard("saveAgreementsMutation", async () => {
        // Replace the full set; sort_order persisted by display order.
        await supabase.from("campaign_agreements").delete().eq("campaign_id", campaignId);
        if (agreementSelections.length === 0) return;
        const rows = agreementSelections.map((s, i) => ({
          campaign_id: campaignId,
          agreement_id: s.agreement_id,
          relationship_type: s.relationship_type,
          is_primary: s.is_primary,
          sort_order: i,
        }));
        const { error } = await supabase.from("campaign_agreements").insert(rows);
        if (error) throw error;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard-scope", campaignId] });
      setStep(4);
    },
  });

  const saveEstimateMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");
      const n = basics.total_worker_estimate ? Number(basics.total_worker_estimate) : null;
      const value = n != null && !Number.isNaN(n) ? n : null;
      const { error } = await supabase
        .from("campaigns")
        .update({ total_worker_estimate: value })
        .eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard", campaignId] });
      setStep(5);
    },
  });

  const saveUnitsMutation = useAuthAwareMutation({
    mutationFn: async (): Promise<{
      updatedUnits: CampaignUnitDraft[];
      autoAllocations: WorkerUnitAllocation;
      autoWorkerIds: number[];
    }> => {
      if (!campaignId) throw new Error("No campaign");

      // Capture the final unit list (with server ou_ids) outside withSessionGuard
      // so we can return it to onSuccess, which applies all state updates in one
      // React batch alongside setStep(6). This prevents step 6 from rendering
      // with stale ou_ids (causing "No units defined").
      let updatedUnits: CampaignUnitDraft[] = units;

      await withSessionGuard("saveUnitsMutation", async () => {
        // Existing rows currently in DB.
        const { data: existing } = await supabase
          .from("campaign_organising_units")
          .select("ou_id")
          .eq("campaign_id", campaignId);
        const existingIds = new Set((existing ?? []).map((r) => r.ou_id as number));
        const keepIds = new Set(
          units.filter((u) => u.ou_id != null).map((u) => u.ou_id as number)
        );
        const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));

        if (toDelete.length > 0) {
          const { error } = await supabase
            .from("campaign_organising_units")
            .delete()
            .in("ou_id", toDelete);
          if (error) throw error;
        }

        // Update existing units that are still present.
        for (const u of units) {
          if (u.ou_id == null) continue;
          const { error } = await supabase
            .from("campaign_organising_units")
            .update({
              ou_type: u.ou_type,
              name: u.name,
              total_workers_estimated: u.total_workers_estimated,
              unit_basis: u.unit_basis,
            })
            .eq("ou_id", u.ou_id);
          if (error) throw error;
        }

        // Insert brand-new units, then map draft_id → server ou_id.
        const drafts = units.filter((u) => u.ou_id == null);
        if (drafts.length > 0) {
          const { data: inserted, error } = await supabase
            .from("campaign_organising_units")
            .insert(
              drafts.map((u, i) => ({
                campaign_id: campaignId,
                ou_type: u.ou_type,
                name: u.name,
                total_workers_estimated: u.total_workers_estimated,
                unit_basis: u.unit_basis,
                display_order: (existingIds.size + i) as number,
              }))
            )
            .select("ou_id");
          if (error) throw error;
          // Splice the returned ou_ids back into local state by index.
          const insertedIds = (inserted ?? []).map((r) => r.ou_id as number);
          const draftIdToOuId = new Map<string, number>();
          drafts.forEach((d, i) => {
            const id = insertedIds[i];
            if (id != null) draftIdToOuId.set(d.draft_id, id);
          });
          // Build the updated array but do NOT call setUnits here — defer to
          // onSuccess so this update is batched with setStep(6).
          updatedUnits = units.map((u) =>
            u.ou_id == null && draftIdToOuId.has(u.draft_id)
              ? { ...u, ou_id: draftIdToOuId.get(u.draft_id)! }
              : u
          );
        }
      });

      // Auto-allocate workers to units that were created from the campaign
      // scope (worksites or employers). Workers are matched by their
      // worksite_id (preferred) or employer_id and placed into the
      // corresponding unit automatically so step 6 starts pre-populated.
      const worksiteUnits = updatedUnits.filter(
        (u) => u.unit_basis?.worksite_id != null && u.ou_id != null
      );
      const employerUnits = updatedUnits.filter(
        (u) => u.unit_basis?.employer_id != null && u.ou_id != null
      );

      const autoAllocations: WorkerUnitAllocation = {};
      const allWorkerIds = new Set<number>(selectedWorkers);

      if (worksiteUnits.length > 0 || employerUnits.length > 0) {
        // Fetch active workers scoped to this campaign's employers / worksites.
        let wq = supabase
          .from("workers")
          .select("worker_id, employer_id, worksite_id")
          .eq("is_active", true)
          .limit(10000);
        if (selectedEmployers.length > 0) {
          wq = wq.in("employer_id", selectedEmployers);
        }
        if (selectedWorksites.length > 0 && !worksiteSectorWide) {
          wq = wq.in("worksite_id", selectedWorksites);
        }
        const { data: workerRows } = await wq;

        for (const w of workerRows ?? []) {
          // Allocate to ALL matching units — a worker can be in both their
          // worksite unit and their employer unit simultaneously.
          const wsUnit = worksiteUnits.find(
            (u) => u.unit_basis?.worksite_id === w.worksite_id
          );
          const empUnit = employerUnits.find(
            (u) => u.unit_basis?.employer_id === w.employer_id
          );
          const matchedOuIds: number[] = [];
          if (wsUnit?.ou_id != null) matchedOuIds.push(wsUnit.ou_id);
          if (empUnit?.ou_id != null) matchedOuIds.push(empUnit.ou_id);
          if (matchedOuIds.length === 0) continue;
          allWorkerIds.add(w.worker_id);
          const set = autoAllocations[w.worker_id] ?? new Set<number>();
          for (const ouId of matchedOuIds) set.add(ouId);
          autoAllocations[w.worker_id] = set;
        }

        // Compute proportional estimates: each scope unit's share of the total
        // campaign estimate, based on actual worker counts. This refines the
        // even distribution set in step 5 when the toggles were clicked.
        const totalCampaignEstimate = basics.total_worker_estimate
          ? Number(basics.total_worker_estimate)
          : null;

        if (totalCampaignEstimate != null && totalCampaignEstimate > 0) {
          // Count unique workers per unit.
          const workerCountPerUnit = new Map<number, number>();
          for (const set of Object.values(autoAllocations)) {
            for (const ouId of set) {
              workerCountPerUnit.set(ouId, (workerCountPerUnit.get(ouId) ?? 0) + 1);
            }
          }
          const totalUniqueWorkers = allWorkerIds.size;

          if (totalUniqueWorkers > 0) {
            const scopeUnitIds = [
              ...worksiteUnits.map((u) => u.ou_id!),
              ...employerUnits.map((u) => u.ou_id!),
            ].filter((id) => id != null);

            // Sort descending by worker count so the last (smallest) unit
            // absorbs any rounding remainder.
            scopeUnitIds.sort(
              (a, b) => (workerCountPerUnit.get(b) ?? 0) - (workerCountPerUnit.get(a) ?? 0)
            );

            const unitEstimates = new Map<number, number>();
            let remainingEstimate = totalCampaignEstimate;
            for (let i = 0; i < scopeUnitIds.length; i++) {
              const ouId = scopeUnitIds[i];
              if (i === scopeUnitIds.length - 1) {
                unitEstimates.set(ouId, Math.max(0, remainingEstimate));
              } else {
                const unitWorkers = workerCountPerUnit.get(ouId) ?? 0;
                const est = Math.round(
                  (unitWorkers / totalUniqueWorkers) * totalCampaignEstimate
                );
                unitEstimates.set(ouId, est);
                remainingEstimate -= est;
              }
            }

            updatedUnits = updatedUnits.map((u) =>
              u.ou_id != null && unitEstimates.has(u.ou_id)
                ? { ...u, total_workers_estimated: unitEstimates.get(u.ou_id)! }
                : u
            );
          }
        }
      }

      return { updatedUnits, autoAllocations, autoWorkerIds: Array.from(allWorkerIds) };
    },
    onSuccess: (result) => {
      // Apply all state updates together so step 6 renders with the correct
      // units (ou_ids resolved), allocations, and worker list in one pass.
      setUnits(result.updatedUnits);
      if (Object.keys(result.autoAllocations).length > 0) {
        setWorkerUnitAllocations(result.autoAllocations);
        setSelectedWorkers(result.autoWorkerIds);
      }
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard-scope", campaignId] });
      setStep(6);
    },
  });

  const saveWorkersMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      await withSessionGuard("saveWorkersMutation", async () => {
        await supabase.from("campaign_worker_membership").delete().eq("campaign_id", campaignId);
        if (selectedWorkers.length > 0) {
          const { error } = await supabase.from("campaign_worker_membership").insert(
            selectedWorkers.map((worker_id) => ({ campaign_id: campaignId, worker_id }))
          );
          if (error) throw error;
        }

        // Wipe campaign_worker_ou for this campaign and re-insert from state.
        // Cleanest path with FK ON DELETE CASCADE is to query existing ou_ids
        // for this campaign and delete by them.
        const ouIds = units.map((u) => u.ou_id).filter((x): x is number => x != null);
        if (ouIds.length > 0) {
          const { error: delErr } = await supabase
            .from("campaign_worker_ou")
            .delete()
            .in("ou_id", ouIds);
          if (delErr) throw delErr;
        }

        const allocationRows: { ou_id: number; worker_id: number }[] = [];
        for (const wid of selectedWorkers) {
          const set = workerUnitAllocations[wid];
          if (!set) continue;
          for (const ouId of set) {
            allocationRows.push({ ou_id: ouId, worker_id: wid });
          }
        }
        if (allocationRows.length > 0) {
          const { error } = await supabase
            .from("campaign_worker_ou")
            .insert(allocationRows);
          if (error) throw error;
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      // After workers, go to campaign ambitions (step 7) for every campaign
      // type — campaign-level membership / leader / activism / outcome goals
      // apply to organising and mobilisation campaigns too, not just bargaining.
      setStep(7);
    },
  });

  const saveCampaignAmbitionsMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      await withSessionGuard("saveCampaignAmbitionsMutation", async () => {
        const { data: existing } = await supabase
          .from("campaign_ambitions")
          .select("campaign_ambition_id")
          .eq("campaign_id", campaignId);
        const existingIds = new Set(
          (existing ?? []).map((r) => r.campaign_ambition_id as number)
        );
        const keepIds = new Set(
          campaignAmbitions
            .filter((a) => a.campaign_ambition_id != null)
            .map((a) => a.campaign_ambition_id as number)
        );
        const toDelete = Array.from(existingIds).filter((id) => !keepIds.has(id));

        if (toDelete.length > 0) {
          const { error } = await supabase
            .from("campaign_ambitions")
            .delete()
            .in("campaign_ambition_id", toDelete);
          if (error) throw error;
        }

        for (const a of campaignAmbitions) {
          if (a.campaign_ambition_id == null) continue;
          const { error } = await supabase
            .from("campaign_ambitions")
            .update({
              category: a.category,
              subcategory: a.subcategory,
              label: a.label,
              target_value: a.target_value || null,
              target_value_max: a.target_value_max || null,
              target_unit: a.target_unit || null,
              target_date: a.target_date || null,
              notes: a.notes || null,
            })
            .eq("campaign_ambition_id", a.campaign_ambition_id);
          if (error) throw error;
        }

        const drafts = campaignAmbitions.filter(
          (a) => a.campaign_ambition_id == null
        );
        if (drafts.length > 0) {
          const { data: inserted, error } = await supabase
            .from("campaign_ambitions")
            .insert(
              drafts.map((a, i) => ({
                campaign_id: campaignId,
                category: a.category,
                subcategory: a.subcategory,
                label: a.label || a.subcategory || a.category,
                target_value: a.target_value || null,
                target_value_max: a.target_value_max || null,
                target_unit: a.target_unit || null,
                target_date: a.target_date || null,
                notes: a.notes || null,
                sort_order: existingIds.size + i,
              }))
            )
            .select("campaign_ambition_id");
          if (error) throw error;

          const newIds = (inserted ?? []).map(
            (r) => r.campaign_ambition_id as number
          );
          const draftIdToServerId = new Map<string, number>();
          drafts.forEach((d, i) => {
            const id = newIds[i];
            if (id != null) draftIdToServerId.set(d.draft_id, id);
          });
          setCampaignAmbitions(
            campaignAmbitions.map((a) =>
              a.campaign_ambition_id == null && draftIdToServerId.has(a.draft_id)
                ? { ...a, campaign_ambition_id: draftIdToServerId.get(a.draft_id)! }
                : a
            )
          );
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard-scope", campaignId] });
      if (basics.campaign_type === "bargaining") {
        setStep(8);
      } else {
        router.push(`/campaigns/${campaignId}`);
      }
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────


  const stepTitle = useMemo(() => {
    if (step === 1) return "Basics & scope";
    if (step === 2) return "Employers & worksites";
    if (step === 3) return "Agreements";
    if (step === 4) return "Worker estimate";
    if (step === 5) return "Campaign units";
    if (step === 6) return "Allocate workers";
    if (step === 7) return "Campaign ambitions";
    return "Create campaign plan";
  }, [step]);

  const totalSteps = basics.campaign_type === "bargaining" ? 8 : 7;

  const step1Valid =
    !!basics.name &&
    !!basics.campaign_scope &&
    (basics.enterprise_agreement_subtype !== "replacement" || !!basics.replaced_agreement_id);

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!canWrite) {
    return <p className="text-muted-foreground">You do not have permission to create campaigns.</p>;
  }

  const step1EditBlocking =
    step === 1 && editMode && (existingCampaignLoading || !basicsHydrated);

  if (step1EditBlocking) {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  const step1Saving = campaignId ? updateCampaignMutation.isPending : createCampaignMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/campaigns">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {editMode && step === 1 ? "Edit campaign" : "Campaign wizard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Step {step} of {totalSteps} — {stepTitle}
          </p>
        </div>
      </div>

      {/* ── Step 1: Basics & scope ──────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign basics</CardTitle>
            <CardDescription>
              {editMode
                ? "Update name, organiser, worker estimate, and other core campaign fields."
                : "Name, type, dates, and universe scope."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={basics.name}
                onChange={(e) => setBasics({ ...basics, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={basics.description}
                onChange={(e) => setBasics({ ...basics, description: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign type</Label>
                <Select
                  value={basics.campaign_type}
                  onValueChange={(v) =>
                    setBasics({ ...basics, campaign_type: v as CampaignType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bargaining">Bargaining</SelectItem>
                    <SelectItem value="organising">Organising</SelectItem>
                    <SelectItem value="mobilisation">Mobilisation</SelectItem>
                    <SelectItem value="political">Political</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>EA subtype (optional)</Label>
                <Select
                  value={basics.enterprise_agreement_subtype || "__none__"}
                  onValueChange={(v) =>
                    setBasics({
                      ...basics,
                      enterprise_agreement_subtype:
                        v === "__none__" ? "" : (v as EnterpriseAgreementSubtype),
                      // Clear replaced agreement when subtype is removed
                      replaced_agreement_id:
                        v === "replacement" ? basics.replaced_agreement_id : null,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not applicable</SelectItem>
                    {(Object.keys(EA_SUBTYPE_LABELS) as EnterpriseAgreementSubtype[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {EA_SUBTYPE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {basics.enterprise_agreement_subtype === "replacement" && (
              <p className="text-xs rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                You&apos;ll attach the agreement(s) being replaced in step 3.
              </p>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={basics.status}
                  onValueChange={(v) =>
                    setBasics({ ...basics, status: v as CampaignStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <CampaignOrganiserSelect
                label="Organiser"
                value={basics.organiser_id}
                onChange={(v) =>
                  setBasics({ ...basics, organiser_id: v === "__none__" ? "" : v })
                }
                allowNone
                autoDefaultToCurrentUser={!campaignId && !editMode}
              />
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input
                type="date"
                value={basics.start_date}
                onChange={(e) => setBasics({ ...basics, start_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Campaign plan timeframe</Label>
              <p className="text-xs text-muted-foreground">
                How long do you expect the planning window to run? Bargaining campaigns
                often don&apos;t have a hard end — pick a planning window in weeks or months,
                or set a custom date if you know it.
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                <Select
                  value={basics.plan_timeframe_mode}
                  onValueChange={(v) =>
                    setBasics({
                      ...basics,
                      plan_timeframe_mode: v as "weeks" | "months" | "custom",
                      // Reset numeric input when switching to custom; reset end_date
                      // when switching away from custom.
                      plan_timeframe_weeks:
                        v === "custom" ? "" : basics.plan_timeframe_weeks,
                      end_date: v === "custom" ? basics.end_date : "",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="custom">Custom date</SelectItem>
                  </SelectContent>
                </Select>
                {basics.plan_timeframe_mode === "custom" ? (
                  <Input
                    className="sm:col-span-2"
                    type="date"
                    value={basics.end_date}
                    onChange={(e) => setBasics({ ...basics, end_date: e.target.value })}
                  />
                ) : (
                  <Input
                    className="sm:col-span-2"
                    type="number"
                    min={1}
                    value={basics.plan_timeframe_weeks}
                    onChange={(e) =>
                      setBasics({ ...basics, plan_timeframe_weeks: e.target.value })
                    }
                    placeholder={
                      basics.plan_timeframe_mode === "months"
                        ? "e.g. 6 months"
                        : "e.g. 12 weeks"
                    }
                  />
                )}
              </div>
              {basics.plan_timeframe_mode !== "custom" &&
                computedTimeframe.endDate && (
                  <p className="text-xs text-muted-foreground">
                    Computed end date: {computedTimeframe.endDate}
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <Label>Campaign scope *</Label>
              <Select
                value={basics.campaign_scope || ""}
                onValueChange={(v) =>
                  setBasics({
                    ...basics,
                    campaign_scope: v as CampaignScopeType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select scope…" />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CAMPAIGN_SCOPE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Scope drives how the next steps filter and prompt. Single-employer scopes
                lock the picker to one employer; multi-site scopes show worksites filtered
                by the chosen employer.
              </p>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <label className="flex items-center gap-2">
                <input
                  id="sw"
                  type="checkbox"
                  checked={basics.sector_wide}
                  onChange={(e) =>
                    setBasics({ ...basics, sector_wide: e.target.checked })
                  }
                />
                <span className="text-sm font-medium">Sector-wide campaign</span>
              </label>
              <p className="text-xs text-muted-foreground">
                Tick this when the campaign covers an entire sector rather than specific
                employers/worksites — e.g., a bargaining round across all offshore drilling
                operators. Reporting and rollups treat sector-wide campaigns as covering
                every active worker in the relevant sectors instead of a discrete worksite
                list, and worker assignment is no longer gated by the worksite picker.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={basics.notes}
                onChange={(e) => setBasics({ ...basics, notes: e.target.value })}
              />
            </div>
            <Button
              className="w-full sm:w-auto"
              disabled={!step1Valid || step1Saving}
              onClick={() =>
                campaignId ? updateCampaignMutation.mutate() : createCampaignMutation.mutate()
              }
            >
              {step1Saving
                ? "Saving…"
                : campaignId
                  ? editMode
                    ? "Save"
                    : "Continue"
                  : "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Employers & worksites ───────────────────────────────── */}
      {step === 2 && campaignId && (
        <StepEmployersWorksites
          campaignScope={basics.campaign_scope}
          replacedAgreementId={basics.replaced_agreement_id}
          selectedEmployers={selectedEmployers}
          setSelectedEmployers={setSelectedEmployers}
          selectedWorksites={selectedWorksites}
          setSelectedWorksites={setSelectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          setWorksiteSectorWide={setWorksiteSectorWide}
          isPending={saveScopeMutation.isPending}
          onBack={() => setStep(1)}
          onContinue={() => saveScopeMutation.mutate()}
        />
      )}

      {/* ── Step 3: Agreements ──────────────────────────────────────────── */}
      {step === 3 && campaignId && (
        <StepAgreements
          selectedEmployers={selectedEmployers}
          selectedWorksites={selectedWorksites}
          selections={agreementSelections}
          setSelections={setAgreementSelections}
          isPending={saveAgreementsMutation.isPending}
          onBack={() => setStep(2)}
          onContinue={() => saveAgreementsMutation.mutate()}
        />
      )}

      {/* ── Step 4: Worker estimate ─────────────────────────────────────── */}
      {step === 4 && campaignId && (
        <StepWorkerEstimate
          selectedEmployers={selectedEmployers}
          selectedWorksites={selectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          totalWorkerEstimate={basics.total_worker_estimate}
          setTotalWorkerEstimate={(v) =>
            setBasics({ ...basics, total_worker_estimate: v })
          }
          isPending={saveEstimateMutation.isPending}
          onBack={() => setStep(3)}
          onContinue={() => saveEstimateMutation.mutate()}
        />
      )}

      {/* ── Step 5: Campaign units ──────────────────────────────────────── */}
      {step === 5 && campaignId && (
        <StepCampaignUnits
          selectedEmployers={selectedEmployers}
          selectedWorksites={selectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          totalWorkerEstimate={
            basics.total_worker_estimate
              ? Number(basics.total_worker_estimate)
              : null
          }
          units={units}
          setUnits={setUnits}
          isPending={saveUnitsMutation.isPending}
          onBack={() => setStep(4)}
          onContinue={() => saveUnitsMutation.mutate()}
        />
      )}

      {/* ── Step 6: Allocate workers ────────────────────────────────────── */}
      {step === 6 && campaignId && (
        <StepAllocateWorkers
          campaignId={campaignId}
          selectedEmployers={selectedEmployers}
          selectedWorksites={selectedWorksites}
          worksiteSectorWide={worksiteSectorWide}
          selectedWorkers={selectedWorkers}
          setSelectedWorkers={setSelectedWorkers}
          workerUnitAllocations={workerUnitAllocations}
          setWorkerUnitAllocations={setWorkerUnitAllocations}
          units={units
            .filter((u) => u.ou_id != null)
            .map((u) => ({
              ou_id: u.ou_id as number,
              name: u.name,
              ou_type: u.ou_type,
              total_workers_estimated: u.total_workers_estimated,
            }))}
          isPending={saveWorkersMutation.isPending}
          onBack={() => setStep(5)}
          onContinue={() => saveWorkersMutation.mutate()}
        />
      )}

      {/* ── Step 7: Campaign-level ambitions ────────────────────────────── */}
      {step === 7 && campaignId && (
        <StepCampaignAmbitions
          ambitions={campaignAmbitions}
          setAmbitions={setCampaignAmbitions}
          isPending={saveCampaignAmbitionsMutation.isPending}
          onBack={() => setStep(6)}
          onContinue={() => saveCampaignAmbitionsMutation.mutate()}
          onSkip={() => {
            if (basics.campaign_type === "bargaining") {
              setStep(8);
            } else {
              router.push(`/campaigns/${campaignId}`);
            }
          }}
        />
      )}

      {/* ── Step 8: Create campaign plan (bargaining only) ──────────────── */}
      {step === 8 && campaignId && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Campaign created</CardTitle>
                <CardDescription>
                  The campaign has been set up. Would you like to create a strategic
                  campaign plan in OA Planner?
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              OA Planner uses a "Playing to Win" methodology with six campaign stages and
              five gate assessments. It will be pre-linked to this bargaining campaign.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1"
                onClick={() => {
                  const url = `/campaigns/new?campaign_id=${campaignId}${existingCampaign?.organiser_id ? `&organiser_id=${existingCampaign.organiser_id}` : ""}`;
                  router.push(url);
                  router.refresh();
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Create Campaign Plan in OA Planner
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push(`/campaigns/${campaignId}`)}
              >
                Skip for now — go to campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {existingCampaign && step > 1 && step < 8 && (
        <p className="text-xs text-muted-foreground">
          Editing campaign #{campaignId}: {existingCampaign.name as string}
        </p>
      )}
    </div>
  );
}
