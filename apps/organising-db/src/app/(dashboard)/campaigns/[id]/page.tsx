"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  CampaignType,
  CampaignStatus,
  ActionType,
  ActionResultType,
  UniverseRuleType,
  CampaignScopeType,
  EnterpriseAgreementSubtype,
} from "@/types/database";
import type { Database } from "@oa/db-types";
import { CampaignAssessmentsSection } from "@/components/campaigns/campaign-assessments";
import { CampaignReportingCharts } from "@/components/campaigns/campaign-reporting";
import { CampaignProgressReport } from "@/components/reports/CampaignProgressReport";
import { WorkforceBoard } from "@/components/campaigns/workforce/workforce-board";
import { CampaignTaskListsSection } from "@/components/campaigns/campaign-task-lists";
import {
  PendingReviewTab,
  usePendingReviewCount,
} from "@/components/campaigns/pending-review-tab";
import {
  RoleCheckTab,
  useRoleCheckCount,
} from "@/components/campaigns/role-check-tab";
import { CampaignPlanPanel } from "@/components/campaigns/campaign-plan-panel";
import { CampaignWorkplanSection } from "@/components/campaigns/campaign-workplan";
import { CampaignUniverseSection } from "@/components/campaigns/campaign-universe-section";
import { CampaignUnitsSection } from "@/components/campaigns/campaign-units-section";
import { CampaignEmployersWorksitesCard } from "@/components/campaigns/campaign-employers-worksites-card";
import { CampaignCommsSection } from "@/components/campaigns/campaign-comms-section";
import { CampaignOverviewMetrics } from "@/components/campaigns/CampaignOverviewMetrics";
import { InlinePhoneOpsPanel } from "@/components/phone/InlinePhoneOpsPanel";
import { InlineSmsOpsPanel } from "@/components/sms/InlineSmsOpsPanel";
import { OutreachCleanupPanel } from "@/components/campaigns/OutreachCleanupPanel";
import { SituationAnalysisCard } from "@/components/campaigns/planning/SituationAnalysisCard";
import { SituationAnalysisEditSheet } from "@/components/campaigns/situation-analysis/SituationAnalysisEditSheet";
import { CAMPAIGN_SCOPE_LABELS, EA_SUBTYPE_LABELS } from "@/lib/campaign/constants";
import { SMS_EPISODE_TOOLS_HREF } from "@/lib/campaign/visible-campaigns";
import { BargainingInsightsWidget } from "@/components/campaigns/bargaining/BargainingInsightsWidget";
import { Phase2WizardLaunchCard } from "@/components/campaigns/bargaining/wizard/Phase2WizardLaunchCard";
import { FoundationalReadinessPanel } from "@/components/campaigns/bargaining/FoundationalReadinessPanel";
import { CampaignResultsSection } from "@/components/campaigns/campaign-results-section";
import { CampaignActionsSection } from "@/components/campaigns/campaign-actions-section";
import { LibrarySection } from "@/components/campaigns/library/campaign-library";
import { SectionPlansTab } from "@/components/campaigns/section-planning/SectionPlansTab";
import { CampaignStageCoveragePanel } from "@/components/campaigns/CampaignStageCoveragePanel";
import { CampaignWorkerDetailProvider } from "@/components/campaigns/campaign-worker-detail-provider";
import { ActivistsWocsSection } from "@/components/campaigns/activists/activists-wocs-section";
import { CoveragePanel } from "@/components/campaigns/activists/coverage-panel";
import { ActivistOverviewCard } from "@/components/campaigns/activists/activist-overview-card";
import {
  VALID_TABS,
  resolveTabParams,
  needsRedirect,
} from "@/lib/campaign-tabs";

interface CampaignDetail {
  campaign_id: number;
  name: string;
  description: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  organiser_id: number | null;
  notes: string | null;
  enterprise_agreement_subtype: EnterpriseAgreementSubtype | null;
  campaign_scope: CampaignScopeType | null;
  total_worker_estimate: number | null;
  sector_wide: boolean;
  organiser: { organiser_name: string } | null;
  /** Added by Wave 1 of Bargaining to Win (20260510100000). May be absent on older rows. */
  current_phase?: string | null;
  is_sms_episode?: boolean;
}

interface UniverseRow {
  universe_id: number;
  campaign_id: number;
  name: string;
  description: string | null;
}

interface UniverseRuleRow {
  rule_id: number;
  universe_id: number;
  rule_type: UniverseRuleType;
  rule_entity_id: number;
  include: boolean;
  entity_name?: string;
}

interface ActionRow {
  action_id: number;
  campaign_id: number;
  action_type: ActionType;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  universe_id: number | null;
}

interface ResultRow {
  result_id: number;
  result_type: ActionResultType;
  notes: string | null;
  action_date: string;
  worker: { worker_id: number; first_name: string; last_name: string } | null;
  action: { action_id: number; title: string } | null;
}

const INITIAL_UNIVERSE_FORM = { name: "", description: "" };

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

const INITIAL_ACTION_FORM = {
  title: "",
  action_type: "meeting" as ActionType,
  description: "",
  due_date: "",
  status: "pending",
  universe_id: "",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Phase 5: persist the selected tab in the URL so back/forward + reload land
  // on the same view, and direct links can deep-link into a tab.
  // Phase A extension: also read/write a ?sub= param and apply legacy redirects
  // via resolveTabParams so old ?tab=workplan URLs rewrite to ?tab=plan&sub=workplan.
  const rawTab = searchParams.get("tab");
  const rawSub = searchParams.get("sub");

  const resolved = resolveTabParams(
    (VALID_TABS as readonly string[]).includes(rawTab ?? "")
      ? rawTab
      : rawTab
        ? null // unknown tab value → fall back to overview
        : null,
    rawSub
  );

  const activeTab = resolved.tab;
  const activeSub = resolved.sub;

  // Redirect legacy URLs (e.g. ?tab=workplan → ?tab=plan&sub=workplan).
  useEffect(() => {
    if (needsRedirect(rawTab, rawSub, resolved)) {
      const params = new URLSearchParams(searchParams.toString());
      if (resolved.tab === "overview") {
        params.delete("tab");
        params.delete("sub");
      } else {
        params.set("tab", resolved.tab);
        if (resolved.sub) {
          params.set("sub", resolved.sub);
        } else {
          params.delete("sub");
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  // Only run when the raw URL params change, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab, rawSub]);

  const handleTabChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "overview") {
        params.delete("tab");
        params.delete("sub");
      } else {
        params.set("tab", next);
        // Clear sub so the cluster default kicks in on next render.
        params.delete("sub");
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleSubChange = useCallback(
    (nextSub: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextSub) {
        params.set("sub", nextSub);
      } else {
        params.delete("sub");
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const id = params.id as string;
  const campaignId = Number(id);
  const campaignIdValid = Number.isFinite(campaignId);

  const [universeDialogOpen, setUniverseDialogOpen] = useState(false);
  const [universeForm, setUniverseForm] = useState(INITIAL_UNIVERSE_FORM);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionForm, setActionForm] = useState(INITIAL_ACTION_FORM);
  const [situationSheetOpen, setSituationSheetOpen] = useState(false);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`*, organiser:organisers(organiser_name)`)
        .eq("campaign_id", campaignId)
        .single();
      if (error) throw error;
      return data as unknown as CampaignDetail;
    },
    enabled: !!user && campaignIdValid,
  });

  useEffect(() => {
    if (campaign?.is_sms_episode) {
      router.replace(SMS_EPISODE_TOOLS_HREF);
    }
  }, [campaign, router]);

  const { data: universes = [] } = useQuery({
    queryKey: ["campaign-universes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_universes")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as UniverseRow[];
    },
    enabled: !!user && campaignIdValid,
  });

  const { data: universeRules = [] } = useQuery({
    queryKey: ["campaign-universe-rules", id],
    queryFn: async () => {
      if (universes.length === 0) return [];
      const uIds = universes.map((u) => u.universe_id);
      const { data, error } = await supabase
        .from("campaign_universe_rules")
        .select("*")
        .in("universe_id", uIds);
      if (error) throw error;
      return (data ?? []) as UniverseRuleRow[];
    },
    enabled: !!user && universes.length > 0,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["campaign-actions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_actions")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
    enabled: !!user && campaignIdValid,
  });

  const { data: results = [] } = useQuery({
    queryKey: ["campaign-results", id],
    queryFn: async () => {
      const actionIds = actions.map((a) => a.action_id);
      if (actionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_action_results")
        .select(
          `result_id, result_type, notes, action_date,
           worker:workers(worker_id, first_name, last_name),
           action:campaign_actions(action_id, title)`
        )
        .in("action_id", actionIds)
        .order("action_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ResultRow[];
    },
    enabled: !!user && actions.length > 0,
  });

  const createUniverseMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const payload: Database["public"]["Tables"]["campaign_universes"]["Insert"] = {
        campaign_id: campaignId,
        name: universeForm.name,
      };
      if (universeForm.description) payload.description = universeForm.description;
      const { error } = await supabase.from("campaign_universes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-universes", id] });
      setUniverseDialogOpen(false);
      setUniverseForm(INITIAL_UNIVERSE_FORM);
    },
  });

  const createActionMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const payload: Database["public"]["Tables"]["campaign_actions"]["Insert"] = {
        campaign_id: campaignId,
        title: actionForm.title,
        action_type: actionForm.action_type,
        status: actionForm.status,
      };
      if (actionForm.description) payload.description = actionForm.description;
      if (actionForm.due_date) payload.due_date = actionForm.due_date;
      if (actionForm.universe_id) payload.universe_id = Number(actionForm.universe_id);
      const { error } = await supabase.from("campaign_actions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-actions", id] });
      setActionDialogOpen(false);
      setActionForm(INITIAL_ACTION_FORM);
    },
  });

  if (campaign?.is_sms_episode) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Campaign not found.</p>
      </div>
    );
  }

  const rulesByUniverse = universeRules.reduce<Record<number, UniverseRuleRow[]>>((acc, rule) => {
    (acc[rule.universe_id] ??= []).push(rule);
    return acc;
  }, {});

  const RULE_TYPE_LABELS: Record<UniverseRuleType, string> = {
    agreement: "Agreement",
    worksite: "Worksite",
    employer: "Employer",
    member_role: "Role",
    sector: "Sector",
    project: "Project",
    work_type: "Work type",
    onshore_offshore: "Onshore / offshore",
  };

  return (
    <div className="space-y-6">
      <CampaignWorkerDetailProvider campaignId={id} canWrite={!!canWrite}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plan">Plan &amp; Execution</TabsTrigger>
          <TabsTrigger value="section-plans">Section Plans</TabsTrigger>
          <TabsTrigger value="workforce">Workforce</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          {campaign.current_phase === "bargaining_to_win" && (
            <TabsTrigger value="bargaining">Bargaining</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <CampaignOverviewMetrics campaignId={campaignId} campaignLabel={campaign?.name ?? undefined} />
          <ActivistOverviewCard campaignId={id} />
          <CampaignEmployersWorksitesCard campaignId={id} />
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">

                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium capitalize">{campaign.campaign_type}</p>
                </div>
                {campaign.enterprise_agreement_subtype && (
                  <div>
                    <span className="text-muted-foreground">EA subtype</span>
                    <p className="font-medium">
                      {EA_SUBTYPE_LABELS[campaign.enterprise_agreement_subtype] ??
                        campaign.enterprise_agreement_subtype}
                    </p>
                  </div>
                )}
                {campaign.campaign_scope && (
                  <div className="col-span-full sm:col-span-1">
                    <span className="text-muted-foreground">Scope</span>
                    <p className="font-medium text-sm">
                      {CAMPAIGN_SCOPE_LABELS[campaign.campaign_scope] ?? campaign.campaign_scope}
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium capitalize">{campaign.status}</p>
                </div>
                {campaign.total_worker_estimate != null && (
                  <div>
                    <span className="text-muted-foreground">Worker estimate</span>
                    <p className="font-medium">{campaign.total_worker_estimate}</p>
                  </div>
                )}
                {campaign.sector_wide && (
                  <div>
                    <span className="text-muted-foreground">Sector-wide</span>
                    <p className="font-medium">Yes</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Organiser</span>
                  <p className="font-medium">
                    {campaign.organiser?.organiser_name ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Start Date</span>
                  <p className="font-medium">{formatDate(campaign.start_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">End Date</span>
                  <p className="font-medium">{formatDate(campaign.end_date)}</p>
                </div>
                {campaign.description && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground">Description</span>
                    <p className="font-medium whitespace-pre-wrap">
                      {campaign.description}
                    </p>
                  </div>
                )}
                {campaign.notes && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground">Notes</span>
                    <p className="font-medium whitespace-pre-wrap">{campaign.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <SituationAnalysisCard
            campaignId={campaignId}
            canWrite={!!canWrite}
            onEdit={canWrite ? () => setSituationSheetOpen(true) : undefined}
          />

          <CampaignStageCoveragePanel campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="plan">
          <Tabs
            value={activeSub ?? "strategy"}
            onValueChange={handleSubChange}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="strategy">Strategy</TabsTrigger>
              <TabsTrigger value="workplan">Workplan</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="task-lists">Task Lists</TabsTrigger>
              <PendingReviewTabTrigger campaignId={campaignId} />
              <RoleCheckTabTrigger campaignId={campaignId} />
            </TabsList>

            <TabsContent value="strategy">
              <CampaignPlanPanel campaignId={Number(id)} organiserId={campaign?.organiser_id} />
              {(!campaign.current_phase || campaign.current_phase === "preparing_to_bargain") && (
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <Phase2WizardLaunchCard campaignId={campaignId} mode="continuation" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="workplan">
              <CampaignWorkplanSection campaignId={id} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="actions">
              <CampaignActionsSection
                campaignId={campaignId}
                canWrite={!!canWrite}
                actions={actions}
                universes={universes}
                actionDialogOpen={actionDialogOpen}
                setActionDialogOpen={setActionDialogOpen}
                actionForm={actionForm}
                setActionForm={setActionForm}
                onCreateAction={() => createActionMutation.mutate()}
                isCreatingAction={createActionMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="task-lists">
              <CampaignTaskListsSection campaignId={id} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="pending-review">
              <PendingReviewTab campaignId={campaignId} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="role-check">
              <RoleCheckTab campaignId={campaignId} canWrite={!!canWrite} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="outcomes">
          <Tabs
            value={activeSub ?? "reports"}
            onValueChange={handleSubChange}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>

            <TabsContent value="reports">
              <CampaignReportingCharts campaignId={id} />
            </TabsContent>

            <TabsContent value="results">
              <CampaignResultsSection results={results} />
            </TabsContent>

            <TabsContent value="insights" className="space-y-6">
              {campaign.current_phase === "bargaining_to_win" && (
                <BargainingInsightsWidget campaignId={campaignId} />
              )}
              <CampaignProgressReport campaignId={campaignId} embedded />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="workforce">
          <Tabs
            value={activeSub ?? "wall-chart"}
            onValueChange={handleSubChange}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="wall-chart">Wall Chart / List</TabsTrigger>
              <TabsTrigger value="campaign-units">Campaign Units</TabsTrigger>
              <TabsTrigger value="universe">Scope</TabsTrigger>
              <TabsTrigger value="assessments">Assessments</TabsTrigger>
              <TabsTrigger value="activists">Activists &amp; WOCs</TabsTrigger>
              <TabsTrigger value="foundational-readiness">Foundational Readiness</TabsTrigger>
            </TabsList>

            <TabsContent value="universe" className="space-y-6">
              <CampaignUniverseSection campaignId={id} canWrite={!!canWrite} />

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-lg">Named universes (optional)</CardTitle>
                    <CardDescription>
                      Labels for the Actions tab only. Campaign scope (employers, worksites, workers) is
                      managed above.
                    </CardDescription>
                  </div>
                  {canWrite && (
                    <Dialog open={universeDialogOpen} onOpenChange={setUniverseDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Plus className="h-4 w-4" />
                          Add named universe
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add named universe</DialogTitle>
                          <DialogDescription>
                            Optional grouping you can attach when creating a campaign action.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="universe_name">Name *</Label>
                            <Input
                              id="universe_name"
                              value={universeForm.name}
                              onChange={(e) =>
                                setUniverseForm({ ...universeForm, name: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="universe_desc">Description</Label>
                            <Textarea
                              id="universe_desc"
                              value={universeForm.description}
                              onChange={(e) =>
                                setUniverseForm({ ...universeForm, description: e.target.value })
                              }
                              rows={3}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setUniverseDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={() => createUniverseMutation.mutate()}
                            disabled={!universeForm.name || createUniverseMutation.isPending}
                          >
                            {createUniverseMutation.isPending ? "Creating…" : "Create Universe"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {universes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No named universes. Actions can still be created without one.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {universes.map((u) => {
                        const rules = rulesByUniverse[u.universe_id] ?? [];
                        return (
                          <div key={u.universe_id} className="rounded-md border p-4 space-y-3">
                            <div>
                              <h4 className="font-medium">{u.name}</h4>
                              {u.description && (
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {u.description}
                                </p>
                              )}
                            </div>
                            {rules.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {rules.map((r) => (
                                  <Badge
                                    key={r.rule_id}
                                    variant={r.include ? "info" : "destructive"}
                                  >
                                    {r.include ? "Include" : "Exclude"}{" "}
                                    {RULE_TYPE_LABELS[r.rule_type]}: #{r.rule_entity_id}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="assessments">
              <CampaignAssessmentsSection campaignId={id} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="wall-chart">
              <WorkforceBoard campaignId={id} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="campaign-units" className="space-y-6">
              <CampaignUnitsSection campaignId={id} canWrite={!!canWrite} />
              {activeSub === "campaign-units" && (
                <CoveragePanel campaignId={id} canWrite={!!canWrite} />
              )}
            </TabsContent>

            <TabsContent value="activists">
              {activeSub === "activists" && (
                <ActivistsWocsSection campaignId={id} canWrite={!!canWrite} />
              )}
            </TabsContent>

            <TabsContent value="foundational-readiness">
              <FoundationalReadinessPanel campaignId={campaignId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="outreach">
          <Tabs
            value={activeSub ?? "comms"}
            onValueChange={handleSubChange}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="comms">Comms</TabsTrigger>
              <TabsTrigger value="phone">Phone Ops</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="soc">SOC</TabsTrigger>
            </TabsList>

            <TabsContent value="comms">
              {/* CampaignCommsSection has its own internal sub-tabs (Drafts & Send /
                  List Builder) — intentional two-level nesting; do not flatten. */}
              <CampaignCommsSection campaignId={id} canWrite={!!canWrite} />
            </TabsContent>

            <TabsContent value="phone">
              <InlinePhoneOpsPanel campaignId={id} />
            </TabsContent>

            <TabsContent value="sms">
              {activeSub === "sms" && <InlineSmsOpsPanel campaignId={id} />}
            </TabsContent>

            <TabsContent value="soc">
              <Card>
                <CardHeader>
                  <CardTitle>Structure of Concern (SOC)</CardTitle>
                  <CardDescription>
                    Build and manage the Structure of Concern diagram for this campaign using
                    the dedicated SOC wizard.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild>
                    <a href={`/campaigns/soc-wizard?cid=${campaignId}`}>
                      Open SOC Wizard
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Cleanup panel — always visible on the Outreach tab regardless of sub-tab */}
          <div className="mt-6">
            <OutreachCleanupPanel campaignId={id} />
          </div>
        </TabsContent>

        <TabsContent value="library">
          {activeTab === "library" && (
            <LibrarySection campaignId={campaignId} canWrite={!!canWrite} />
          )}
        </TabsContent>

        <TabsContent value="section-plans">
          {activeTab === "section-plans" && (
            <SectionPlansTab campaignId={campaignId} />
          )}
        </TabsContent>

        <TabsContent value="bargaining">
          <BargainingTabContent campaignId={campaignId} />
        </TabsContent>
        </Tabs>
      </CampaignWorkerDetailProvider>

      {campaignIdValid && (
        <SituationAnalysisEditSheet
          campaignId={campaignId}
          open={situationSheetOpen}
          onOpenChange={setSituationSheetOpen}
        />
      )}
    </div>
  );
}

// ── Pending Review trigger (Phase 5) ──────────────────────────────────
// Renders the "Pending review" sub-tab inside the Plan cluster with a live
// count badge. The badge uses the same React Query key the tab uses, so the
// count drops to zero immediately after Approve / Merge / Reject mutations
// invalidate the queue.
function PendingReviewTabTrigger({ campaignId }: { campaignId: number }) {
  const { data: count = 0 } = usePendingReviewCount(campaignId);
  return (
    <TabsTrigger value="pending-review" className="gap-1.5">
      Pending review
      {count > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}

// ── Role Check trigger (post-Phase-6 remediation) ─────────────────────
// Surfaces workers rated 1 (supportive_leader) whose global union role
// is unset / non-leader. Reviewers confirm the role with a single click.
function RoleCheckTabTrigger({ campaignId }: { campaignId: number }) {
  const { data: count = 0 } = useRoleCheckCount(campaignId);
  return (
    <TabsTrigger value="role-check" className="gap-1.5">
      Role check
      {count > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}

// ── Bargaining tab content (stub — delegates to /bargaining sub-route) ─────

function BargainingTabContent({ campaignId }: { campaignId: number }) {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-4">
        <p className="text-sm text-slate-600">
          The Bargaining Hub is a dedicated page with the full stage planner,
          decisions, PABO, PIA actions, and member votes.
        </p>
        <Button onClick={() => router.push(`/campaigns/${campaignId}/bargaining`)}>
          Open Bargaining Hub
        </Button>
      </CardContent>
    </Card>
  );
}
