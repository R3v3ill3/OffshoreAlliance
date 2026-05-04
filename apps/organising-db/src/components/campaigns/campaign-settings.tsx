"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation, withSessionGuard } from "@/lib/hooks/useAuthAwareMutation";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ArrowLeft, Save } from "lucide-react";
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
import { StepWorkerEstimate } from "@/components/campaigns/step-worker-estimate";
import {
  StepCampaignUnits,
  type CampaignUnitDraft,
} from "@/components/campaigns/step-campaign-units";
import {
  StepCampaignAmbitions,
  type CampaignAmbitionDraft,
} from "@/components/campaigns/step-campaign-ambitions";
import { CAMPAIGN_SCOPE_LABELS, EA_SUBTYPE_LABELS } from "@/lib/campaign/constants";
import type {
  CampaignAmbitionCategory,
  CampaignOuType,
  CampaignOuUnitBasis,
  CampaignScopeType,
  CampaignStatus,
  CampaignType,
  EnterpriseAgreementSubtype,
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
  if (!basics.start_date) return { weeks, endDate: null };
  const start = new Date(`${basics.start_date}T12:00:00`);
  const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return { weeks, endDate: `${yyyy}-${mm}-${dd}` };
}

interface CampaignSettingsProps {
  campaignId: number;
}

export function CampaignSettings({ campaignId }: CampaignSettingsProps) {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite, isAdmin, loading: authLoading } = useAuth();

  const basicsHydratedFor = useRef<number | null>(null);
  const scopeHydratedFor = useRef<number | null>(null);

  const [basics, setBasics] = useState({
    name: "",
    description: "",
    campaign_type: "bargaining" as CampaignType,
    enterprise_agreement_subtype: "" as "" | EnterpriseAgreementSubtype,
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
  const [units, setUnits] = useState<CampaignUnitDraft[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<number[]>([]);
  const [workerUnitAllocations, setWorkerUnitAllocations] =
    useState<WorkerUnitAllocation>({});
  const [campaignAmbitions, setCampaignAmbitions] = useState<
    CampaignAmbitionDraft[]
  >([]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign-settings", campaignId],
    queryFn: async () => {
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

  const { data: scope, isLoading: scopeLoading } = useQuery({
    queryKey: ["campaign-settings-scope", campaignId],
    queryFn: async () => {
      const [ce, cw, cw2, cou, cwo, cam] = await Promise.all([
        supabase.from("campaign_employers").select("employer_id").eq("campaign_id", campaignId),
        supabase
          .from("campaign_worksites")
          .select("worksite_id, sector_wide")
          .eq("campaign_id", campaignId),
        supabase
          .from("campaign_worker_membership")
          .select("worker_id")
          .eq("campaign_id", campaignId),
        supabase
          .from("campaign_organising_units")
          .select("ou_id, ou_type, name, total_workers_estimated, unit_basis")
          .eq("campaign_id", campaignId)
          .order("display_order", { ascending: true }),
        supabase
          .from("campaign_worker_ou")
          .select("ou_id, worker_id, campaign_organising_units!inner(campaign_id)")
          .eq("campaign_organising_units.campaign_id", campaignId),
        supabase
          .from("campaign_ambitions")
          .select(
            "campaign_ambition_id, category, subcategory, label, target_value, target_value_max, target_unit, target_date, notes, sort_order"
          )
          .eq("campaign_id", campaignId)
          .order("sort_order", { ascending: true }),
      ]);
      if (ce.error) throw ce.error;
      if (cw.error) throw cw.error;
      if (cw2.error) throw cw2.error;
      const ouRows = cou.error ? [] : (cou.data ?? []);
      const cwoRows = cwo.error ? [] : (cwo.data ?? []);
      const camRows = cam.error ? [] : (cam.data ?? []);
      const worksiteRows = cw.data ?? [];
      const sectorWide = worksiteRows.some(
        (w) => w.sector_wide && w.worksite_id == null
      );
      return {
        employers: (ce.data ?? []).map((r) => r.employer_id),
        sectorWide,
        worksites: worksiteRows
          .filter((w) => w.worksite_id != null)
          .map((w) => w.worksite_id!),
        workers: (cw2.data ?? []).map((r) => r.worker_id),
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
        ambitions: (camRows as Array<{
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

  // ── Hydration ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!campaign || basicsHydratedFor.current === campaignId) return;
    let cancelled = false;
    (async () => {
      let organiser = "";
      if (campaign.organiser_id != null) {
        const { data } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("organiser_id", campaign.organiser_id)
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        organiser = data?.user_id
          ? campaignOrganiserPickerValueForUser(data.user_id as string)
          : String(campaign.organiser_id);
      }

      const planTimeframeWeeks =
        (campaign as { plan_timeframe_weeks?: number | null }).plan_timeframe_weeks ??
        null;
      const hasEndDate = !!campaign.end_date;
      const inferredMode: "weeks" | "months" | "custom" =
        planTimeframeWeeks != null
          ? planTimeframeWeeks % 4 === 0
            ? "months"
            : "weeks"
          : hasEndDate
          ? "custom"
          : "weeks";

      setBasics({
        name: campaign.name ?? "",
        description: campaign.description ?? "",
        campaign_type: (campaign.campaign_type as CampaignType) ?? "bargaining",
        enterprise_agreement_subtype:
          (campaign.enterprise_agreement_subtype as EnterpriseAgreementSubtype | null) ??
          "",
        status: (campaign.status as CampaignStatus) ?? "planning",
        start_date: formatDateForInput(campaign.start_date),
        end_date: formatDateForInput(campaign.end_date),
        plan_timeframe_mode: inferredMode,
        plan_timeframe_weeks:
          planTimeframeWeeks != null
            ? inferredMode === "months"
              ? String(planTimeframeWeeks / 4)
              : String(planTimeframeWeeks)
            : "",
        organiser_id: organiser,
        notes: campaign.notes ?? "",
        campaign_scope:
          (campaign.campaign_scope as CampaignScopeType | null) ?? "",
        total_worker_estimate:
          campaign.total_worker_estimate != null
            ? String(campaign.total_worker_estimate)
            : "",
        sector_wide: campaign.sector_wide ?? false,
      });
      basicsHydratedFor.current = campaignId;
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign, campaignId, supabase]);

  useEffect(() => {
    if (!scope || scopeHydratedFor.current === campaignId) return;
    // Intentional one-shot hydration of 7 state slices from a single
    // server-loaded snapshot. Same pattern as CampaignWizard; tracked in
    // docs/campaigns-review-incidental-issues.md (item #2) for a wider
    // refactor to useReducer / useSyncExternalStore later.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedEmployers(scope.employers);
    setWorksiteSectorWide(scope.sectorWide);
    setSelectedWorksites(scope.worksites);
    setSelectedWorkers(scope.workers);
    setUnits(scope.units);
    setWorkerUnitAllocations(scope.workerUnitAllocations);
    setCampaignAmbitions(scope.ambitions);
    /* eslint-enable react-hooks/set-state-in-effect */
    scopeHydratedFor.current = campaignId;
  }, [scope, campaignId]);

  const computedTimeframe = useMemo(() => computePlanTimeframe(basics), [basics]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  function invalidateScope() {
    queryClient.invalidateQueries({
      queryKey: ["campaign-settings-scope", campaignId],
    });
    queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
  }

  const saveBasicsMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const resolvedOrganiserId = await resolveCampaignOrganiserId(
        supabase,
        basics.organiser_id,
        { currentUserId: user.id, isAdmin }
      );
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
      };
      const n = basics.total_worker_estimate
        ? Number(basics.total_worker_estimate)
        : null;
      payload.total_worker_estimate = n != null && !Number.isNaN(n) ? n : null;
      const { error } = await supabase
        .from("campaigns")
        .update(payload)
        .eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-settings", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const saveScopeMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("settings:saveScope", async () => {
        await supabase
          .from("campaign_employers")
          .delete()
          .eq("campaign_id", campaignId);
        await supabase
          .from("campaign_worksites")
          .delete()
          .eq("campaign_id", campaignId);

        if (selectedEmployers.length > 0) {
          const { error } = await supabase
            .from("campaign_employers")
            .insert(
              selectedEmployers.map((employer_id) => ({
                campaign_id: campaignId,
                employer_id,
              }))
            );
          if (error) throw error;
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
    onSuccess: invalidateScope,
  });

  const saveEstimateMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const n = basics.total_worker_estimate
        ? Number(basics.total_worker_estimate)
        : null;
      const value = n != null && !Number.isNaN(n) ? n : null;
      const { error } = await supabase
        .from("campaigns")
        .update({ total_worker_estimate: value })
        .eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: invalidateScope,
  });

  const saveUnitsMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("settings:saveUnits", async () => {
        const { data: existing } = await supabase
          .from("campaign_organising_units")
          .select("ou_id")
          .eq("campaign_id", campaignId);
        const existingIds = new Set(
          (existing ?? []).map((r) => r.ou_id as number)
        );
        const keepIds = new Set(
          units.filter((u) => u.ou_id != null).map((u) => u.ou_id as number)
        );
        const toDelete = Array.from(existingIds).filter(
          (id) => !keepIds.has(id)
        );
        if (toDelete.length > 0) {
          const { error } = await supabase
            .from("campaign_organising_units")
            .delete()
            .in("ou_id", toDelete);
          if (error) throw error;
        }

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
                display_order: existingIds.size + i,
              }))
            )
            .select("ou_id");
          if (error) throw error;
          const insertedIds = (inserted ?? []).map((r) => r.ou_id as number);
          const draftIdToOuId = new Map<string, number>();
          drafts.forEach((d, i) => {
            const id = insertedIds[i];
            if (id != null) draftIdToOuId.set(d.draft_id, id);
          });
          setUnits(
            units.map((u) =>
              u.ou_id == null && draftIdToOuId.has(u.draft_id)
                ? { ...u, ou_id: draftIdToOuId.get(u.draft_id)! }
                : u
            )
          );
        }
      });
    },
    onSuccess: invalidateScope,
  });

  const saveWorkersMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("settings:saveWorkers", async () => {
        await supabase
          .from("campaign_worker_membership")
          .delete()
          .eq("campaign_id", campaignId);
        if (selectedWorkers.length > 0) {
          const { error } = await supabase
            .from("campaign_worker_membership")
            .insert(
              selectedWorkers.map((worker_id) => ({
                campaign_id: campaignId,
                worker_id,
              }))
            );
          if (error) throw error;
        }
        const ouIds = units
          .map((u) => u.ou_id)
          .filter((x): x is number => x != null);
        if (ouIds.length > 0) {
          const { error } = await supabase
            .from("campaign_worker_ou")
            .delete()
            .in("ou_id", ouIds);
          if (error) throw error;
        }
        const allocationRows: { ou_id: number; worker_id: number }[] = [];
        for (const wid of selectedWorkers) {
          const set = workerUnitAllocations[wid];
          if (!set) continue;
          for (const ouId of set) allocationRows.push({ ou_id: ouId, worker_id: wid });
        }
        if (allocationRows.length > 0) {
          const { error } = await supabase
            .from("campaign_worker_ou")
            .insert(allocationRows);
          if (error) throw error;
        }
      });
    },
    onSuccess: invalidateScope,
  });

  const saveAmbitionsMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("settings:saveAmbitions", async () => {
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
        const toDelete = Array.from(existingIds).filter(
          (id) => !keepIds.has(id)
        );
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
    onSuccess: invalidateScope,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (authLoading || (campaignLoading && !campaign)) {
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
    return (
      <p className="text-muted-foreground">
        You do not have permission to edit campaign settings.
      </p>
    );
  }

  const totalWorkerEstimateNum = basics.total_worker_estimate
    ? Number(basics.total_worker_estimate)
    : null;
  const isBargaining = basics.campaign_type === "bargaining";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/campaigns/${campaignId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {campaign?.name ?? "Campaign"} — settings
          </h1>
          <p className="text-xs text-muted-foreground">
            Edit any section. Each section saves independently.
          </p>
        </div>
      </div>

      {scopeLoading && (
        <p className="text-sm text-muted-foreground">Loading sections…</p>
      )}

      <Accordion type="multiple" className="space-y-2">
        {/* ── Section 1: Basics ─────────────────────────────────────────── */}
        <AccordionItem value="basics" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Basics</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {basics.campaign_type}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-4 grid gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={basics.name}
                    onChange={(e) =>
                      setBasics({ ...basics, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    rows={3}
                    value={basics.description}
                    onChange={(e) =>
                      setBasics({ ...basics, description: e.target.value })
                    }
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
                            v === "__none__"
                              ? ""
                              : (v as EnterpriseAgreementSubtype),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not applicable</SelectItem>
                        {(Object.keys(EA_SUBTYPE_LABELS) as EnterpriseAgreementSubtype[]).map(
                          (k) => (
                            <SelectItem key={k} value={k}>
                              {EA_SUBTYPE_LABELS[k]}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                      setBasics({
                        ...basics,
                        organiser_id: v === "__none__" ? "" : v,
                      })
                    }
                    allowNone
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    value={basics.start_date}
                    onChange={(e) =>
                      setBasics({ ...basics, start_date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Plan timeframe</Label>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <Select
                      value={basics.plan_timeframe_mode}
                      onValueChange={(v) =>
                        setBasics({
                          ...basics,
                          plan_timeframe_mode: v as
                            | "weeks"
                            | "months"
                            | "custom",
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
                        onChange={(e) =>
                          setBasics({ ...basics, end_date: e.target.value })
                        }
                      />
                    ) : (
                      <Input
                        className="sm:col-span-2"
                        type="number"
                        min={1}
                        value={basics.plan_timeframe_weeks}
                        onChange={(e) =>
                          setBasics({
                            ...basics,
                            plan_timeframe_weeks: e.target.value,
                          })
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
                  <Label>Campaign scope</Label>
                  <Select
                    value={basics.campaign_scope || "__none__"}
                    onValueChange={(v) =>
                      setBasics({
                        ...basics,
                        campaign_scope:
                          v === "__none__" ? "" : (v as CampaignScopeType),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not set</SelectItem>
                      {SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {CAMPAIGN_SCOPE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={basics.sector_wide}
                    onChange={(e) =>
                      setBasics({ ...basics, sector_wide: e.target.checked })
                    }
                  />
                  <span className="text-sm">Sector-wide campaign</span>
                </label>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={basics.notes}
                    onChange={(e) =>
                      setBasics({ ...basics, notes: e.target.value })
                    }
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => saveBasicsMutation.mutate()}
                    disabled={
                      !basics.name || saveBasicsMutation.isPending
                    }
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {saveBasicsMutation.isPending ? "Saving…" : "Save basics"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 2: Employers & worksites ──────────────────────────── */}
        <AccordionItem value="scope" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Employers &amp; worksites</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {selectedEmployers.length} emp · {worksiteSectorWide ? "sector" : selectedWorksites.length + " sites"}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StepEmployersWorksites
              campaignScope={basics.campaign_scope}
              replacedAgreementId={null}
              selectedEmployers={selectedEmployers}
              setSelectedEmployers={setSelectedEmployers}
              selectedWorksites={selectedWorksites}
              setSelectedWorksites={setSelectedWorksites}
              worksiteSectorWide={worksiteSectorWide}
              setWorksiteSectorWide={setWorksiteSectorWide}
              isPending={saveScopeMutation.isPending}
              onBack={() => undefined}
              onContinue={() => saveScopeMutation.mutate()}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 3: Worker estimate ─────────────────────────────────── */}
        <AccordionItem value="estimate" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Worker estimate</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {basics.total_worker_estimate || "—"}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StepWorkerEstimate
              selectedEmployers={selectedEmployers}
              selectedWorksites={selectedWorksites}
              worksiteSectorWide={worksiteSectorWide}
              totalWorkerEstimate={basics.total_worker_estimate}
              setTotalWorkerEstimate={(v) =>
                setBasics({ ...basics, total_worker_estimate: v })
              }
              isPending={saveEstimateMutation.isPending}
              onBack={() => undefined}
              onContinue={() => saveEstimateMutation.mutate()}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 5: Campaign units ─────────────────────────────────── */}
        <AccordionItem value="units" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Campaign units</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {units.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StepCampaignUnits
              selectedEmployers={selectedEmployers}
              selectedWorksites={selectedWorksites}
              worksiteSectorWide={worksiteSectorWide}
              totalWorkerEstimate={totalWorkerEstimateNum}
              units={units}
              setUnits={setUnits}
              isPending={saveUnitsMutation.isPending}
              onBack={() => undefined}
              onContinue={() => saveUnitsMutation.mutate()}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 6: Allocate workers ───────────────────────────────── */}
        <AccordionItem value="allocate" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Allocate workers</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {selectedWorkers.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
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
              onBack={() => undefined}
              onContinue={() => saveWorkersMutation.mutate()}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 7: Campaign ambitions ─────────────────────────────── */}
        <AccordionItem value="ambitions" className="border rounded-md px-4">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <span className="font-medium">Campaign ambitions</span>
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {campaignAmbitions.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <StepCampaignAmbitions
              campaignId={campaignId}
              ambitions={campaignAmbitions}
              setAmbitions={setCampaignAmbitions}
              isPending={saveAmbitionsMutation.isPending}
              onBack={() => undefined}
              onContinue={() => saveAmbitionsMutation.mutate()}
              onSkip={() => undefined}
            />
          </AccordionContent>
        </AccordionItem>

        {/* ── Section 8 (bargaining): Plan handoff ──────────────────────── */}
        {isBargaining && (
          <AccordionItem value="plan" className="border rounded-md px-4">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <span className="font-medium">Strategic plan</span>
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  bargaining
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">OA Planner setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    The strategic plan (6 stages, 5 gate assessments) lives in OA
                    Planner. Open the plan editor to add or edit stage ambitions,
                    where-to-play, theory of winning, capacities and management
                    systems.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild>
                      <Link href={`/campaigns/${campaignId}?tab=campaign-plan`}>
                        Open plan
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link
                        href={`/campaigns/new?campaign_id=${campaignId}`}
                      >
                        Re-run planner setup
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
}
