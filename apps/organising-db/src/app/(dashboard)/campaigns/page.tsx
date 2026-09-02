"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import dynamic from "next/dynamic";
import { Plus, Wand2, ExternalLink, Trash2, Megaphone, FileStack, Mail, MessageSquare, Phone, Upload, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampaignType, CampaignStatus } from "@/types/database";
import {
  CampaignDeleteDialog,
  type CampaignDeleteTarget,
} from "@/components/campaigns/campaign-delete-dialog";
import { CampaignsDashboard } from "@/components/campaigns/CampaignsDashboard";
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns";

const TemplatesTab = dynamic(() => import("@/components/campaigns/templates-tab").then((m) => ({ default: m.TemplatesTab })), { ssr: false });

const CampaignImportWizard = dynamic(
  () => import("@/components/import/campaign-import-wizard").then((m) => ({ default: m.CampaignImportWizard })),
  { ssr: false }
);

interface StagePlanSummary {
  plan_id: number;
  stage_number: number;
  stage_name: string;
  status: string;
}

interface CampaignRow {
  campaign_id: number;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  is_standing: boolean;
  start_date: string | null;
  end_date: string | null;
  total_worker_estimate: number | null;
  organiser_id: number | null;
  organiser: { organiser_name: string } | null;
  campaign_stage_plans: StagePlanSummary[];
  [key: string]: unknown;
}

interface OrganiserOption {
  organiser_id: number;
  organiser_name: string;
  user_profiles:
    | Array<{
        display_name: string | null;
        work_role: string | null;
      }>
    | null;
}

function organiserDisplayName(organiser: OrganiserOption): string {
  const profile = organiser.user_profiles?.find((p) => p.display_name?.trim());
  return profile?.display_name?.trim() || organiser.organiser_name;
}


function PlanStatusBadge({ stagePlans }: { stagePlans: StagePlanSummary[] }) {
  if (!stagePlans || stagePlans.length === 0) {
    return <span className="text-xs text-muted-foreground">No plan</span>;
  }
  const allComplete = stagePlans.every((s) => s.status === "completed");
  if (allComplete) {
    return <Badge variant="success">Plan complete</Badge>;
  }
  const active = stagePlans.find((s) => s.status === "active");
  if (active) {
    return (
      <Badge variant="info" className="whitespace-nowrap">
        Stage {active.stage_number}: {active.stage_name}
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">Draft plan</span>;
}

const STATUS_VARIANT: Record<CampaignStatus, "secondary" | "success" | "info" | "warning"> = {
  planning: "secondary",
  active: "success",
  completed: "info",
  suspended: "warning",
};

const TYPE_VARIANT: Record<CampaignType, "default" | "info" | "warning" | "secondary"> = {
  bargaining: "info",
  organising: "default",
  mobilisation: "warning",
  political: "secondary",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

/** Matches inactive `TabsTrigger` styling for outline-link actions in the tab bar. */
const tabBarActionClassName =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium text-muted-foreground ring-offset-background transition-all hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function CampaignsPage() {
  const router = useRouter();
  const { user, profile, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<CampaignDeleteTarget | null>(null);
  const [createSelectorOpen, setCreateSelectorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** When null, filter defaults to the signed-in user's organiser (if any), else "all". */
  const [organiserFilterOverride, setOrganiserFilterOverride] = useState<string | null>(null);

  const selectedOrganiserId = useMemo(() => {
    if (organiserFilterOverride !== null) return organiserFilterOverride;
    if (profile?.organiser_id != null) return String(profile.organiser_id);
    return "all";
  }, [organiserFilterOverride, profile?.organiser_id]);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from("campaigns")
          .select(
            `campaign_id, name, campaign_type, status, is_standing, start_date, end_date,
             total_worker_estimate, organiser_id,
             organiser:organisers(organiser_name),
             campaign_stage_plans(plan_id, stage_number, stage_name, status)`
          )
          .order("created_at", { ascending: false })
      );

      if (error) throw error;
      return (data ?? []) as unknown as CampaignRow[];
    },
    enabled: !!user,
  });

  const { data: organisers = [] } = useQuery({
    queryKey: ["campaign-organiser-filter-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisers")
        .select("organiser_id, organiser_name, user_profiles(display_name, work_role)")
        .eq("is_active", true)
        .order("organiser_name");

      if (error) throw error;
      return (data ?? []) as unknown as OrganiserOption[];
    },
    enabled: !!user,
  });

  const organiserLabelById = useMemo(() => {
    return new Map(
      organisers.map((organiser) => [
        organiser.organiser_id,
        organiserDisplayName(organiser),
      ])
    );
  }, [organisers]);

  const organiserOptions = useMemo(
    () =>
      organisers.map((organiser) => ({
        id: organiser.organiser_id,
        label: organiserDisplayName(organiser),
      })),
    [organisers]
  );

  const campaignsWithFreshOrganiserNames = useMemo(() => {
    return campaigns.map((campaign) => {
      if (campaign.organiser_id == null) return campaign;
      const organiserName = organiserLabelById.get(campaign.organiser_id);
      if (!organiserName) return campaign;
      return {
        ...campaign,
        organiser: { organiser_name: organiserName },
      };
    });
  }, [campaigns, organiserLabelById]);

  const filteredCampaigns = useMemo(() => {
    if (selectedOrganiserId === "all") return campaignsWithFreshOrganiserNames;
    return campaignsWithFreshOrganiserNames.filter(
      (c) => String(c.organiser_id) === selectedOrganiserId
    );
  }, [campaignsWithFreshOrganiserNames, selectedOrganiserId]);

  const columns = useMemo<Column<CampaignRow>[]>(() => {
    const base: Column<CampaignRow>[] = [
      {
        key: "name",
        header: "Name",
        render: (row) => (
          <span className="inline-flex items-center gap-2">
            {row.name}
            {row.is_standing && (
              <Badge variant="secondary" className="text-xs shrink-0">Standing</Badge>
            )}
          </span>
        ),
      },
      {
        key: "campaign_type",
        header: "Type",
        render: (row) => (
          <Badge variant={TYPE_VARIANT[row.campaign_type]}>{row.campaign_type}</Badge>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (row) => <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>,
      },
      {
        key: "start_date",
        header: "Start Date",
        render: (row) => formatDate(row.start_date),
      },
      {
        key: "end_date",
        header: "End Date",
        render: (row) => formatDate(row.end_date),
      },
      {
        key: "organiser_name",
        header: "Organiser",
        render: (row) => row.organiser?.organiser_name ?? "—",
      },
      {
        key: "campaign_plan",
        header: "Campaign Plan",
        render: (row) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <PlanStatusBadge stagePlans={row.campaign_stage_plans ?? []} />
            <a
              href={`/campaigns/${row.campaign_id}/plan`}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View campaign plan"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ),
      },
    ];
    if (canWrite) {
      base.push({
        key: "_actions",
        header: "Actions",
        sortable: false,
        className: "w-14 text-right",
        render: (row) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${row.name}`}
              onClick={() => setDeleteTarget({ campaign_id: row.campaign_id, name: row.name })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      });
    }
    return base;
  }, [canWrite]);

  return (
    <div className="space-y-6">
      <CampaignDeleteDialog campaign={deleteTarget} onClose={() => setDeleteTarget(null)} />

      {canWrite && (
        <CampaignImportWizard
          open={importOpen}
          onOpenChange={setImportOpen}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["campaigns"] })}
        />
      )}

      {/* Campaign creation selector dialog */}
      <Dialog open={createSelectorOpen} onOpenChange={setCreateSelectorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a new campaign</DialogTitle>
            <DialogDescription>
              Choose how you&apos;d like to set up the campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <button
              type="button"
              onClick={() => { setCreateSelectorOpen(false); router.push("/campaigns/new"); }}
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-2 text-primary">
                <Wand2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold leading-tight">Campaign wizard</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Guided step-by-step setup. Walk through employers, worksites,
                  agreements, worker estimates, units, ambitions, and hand off to
                  the planner — all in one flow.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setCreateSelectorOpen(false); router.push("/campaigns/new/manual"); }}
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="mt-0.5 shrink-0 rounded-md bg-muted p-2 text-muted-foreground">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold leading-tight">Manual create</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter just the campaign name, type, and status to create the
                  record instantly, then configure every section — employers,
                  agreements, units, ambitions — from one settings page at your
                  own pace. Best for power users who already know what they want.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campaigns</h1>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-4">
        <div className="flex flex-wrap items-center gap-1">
          <TabsList className="h-9">
            <TabsTrigger value="campaigns" className="gap-2">
              <Megaphone className="h-4 w-4" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileStack className="h-4 w-4" />
              Templates
            </TabsTrigger>
          </TabsList>
          {canWrite && (
            <div className="inline-flex h-9 flex-wrap items-center justify-center gap-0 rounded-lg bg-muted p-1 text-muted-foreground sm:flex-nowrap">
              <button
                type="button"
                onClick={() => setCreateSelectorOpen(true)}
                className={tabBarActionClassName}
              >
                <Plus className="h-4 w-4 shrink-0" />
                Create campaign
              </button>
              <Link href="/campaigns/email-wizard" className={tabBarActionClassName}>
                <Mail className="h-4 w-4 shrink-0" />
                Email wizard
              </Link>
              <Link href="/campaigns/phone-wizard" className={tabBarActionClassName}>
                <Phone className="h-4 w-4 shrink-0" />
                Phone wizard
              </Link>
              <Link href="/sms" className={tabBarActionClassName}>
                <MessageSquare className="h-4 w-4 shrink-0" />
                SMS tools
              </Link>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className={tabBarActionClassName}
              >
                <Upload className="h-4 w-4 shrink-0" />
                Import lists
              </button>
            </div>
          )}
        </div>

        <TabsContent value="campaigns" className="mt-0">
          <div className="space-y-6">
            {/* Metrics dashboard — above the table */}
            {!isLoading && user && (
              <>
                {profile?.organiser_id == null && (
                  <p className="text-xs text-muted-foreground">
                    Your account is not linked to an organiser record yet, so the list is not scoped to you by
                    default. Use Administration to link your profile, or filter manually when campaigns exist.
                  </p>
                )}
                <CampaignsDashboard
                  campaigns={campaignsWithFreshOrganiserNames}
                  organiserOptions={organiserOptions}
                  selectedOrganiserId={selectedOrganiserId}
                  onOrganiserChange={setOrganiserFilterOverride}
                  onRowClick={(id) => router.push(`/campaigns/${id}?tab=workforce&sub=wall-chart`)}
                  currentUserOrganiser={
                    profile?.organiser_id != null
                      ? {
                          id: profile.organiser_id,
                          label: profile.display_name?.trim() || "You",
                        }
                      : null
                  }
                  canWrite={canWrite}
                />
              </>
            )}

            <div className="space-y-4">
              <DataTable<CampaignRow>
                data={filteredCampaigns}
                columns={columns}
                searchPlaceholder="Search campaigns…"
                searchKeys={["name"]}
                onRowClick={(row) =>
                  router.push(`/campaigns/${row.campaign_id}?tab=workforce&sub=wall-chart`)
                }
                loading={isLoading}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
