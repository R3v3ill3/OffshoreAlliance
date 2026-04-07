"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Wand2, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CampaignType, CampaignStatus } from "@/types/database";
import type { Database } from "@oa/db-types";
import { resolveCampaignOrganiserId } from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import {
  CampaignDeleteDialog,
  type CampaignDeleteTarget,
} from "@/components/campaigns/campaign-delete-dialog";

interface StagePlanSummary {
  stage_number: number;
  stage_name: string;
  status: string;
}

interface CampaignRow {
  campaign_id: number;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  organiser: { organiser_name: string } | null;
  campaign_stage_plans: StagePlanSummary[];
  [key: string]: unknown;
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

const INITIAL_FORM = {
  name: "",
  description: "",
  campaign_type: "organising" as CampaignType,
  status: "planning" as CampaignStatus,
  start_date: "",
  end_date: "",
  organiser_id: "",
  notes: "",
};

export default function CampaignsPage() {
  const router = useRouter();
  const { user, canWrite, isAdmin } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<CampaignDeleteTarget | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [organiserDialogKey, setOrganiserDialogKey] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          `campaign_id, name, campaign_type, status, start_date, end_date,
           organiser:organisers(organiser_name),
           campaign_stage_plans(stage_number, stage_name, status)`
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as CampaignRow[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");

      const resolvedOrganiserId = await resolveCampaignOrganiserId(supabase, form.organiser_id, {
        currentUserId: user.id,
        isAdmin,
      });

      const payload: Database["public"]["Tables"]["campaigns"]["Insert"] = {
        name: form.name,
        campaign_type: form.campaign_type,
        status: form.status,
      };
      if (form.description) payload.description = form.description;
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;
      if (resolvedOrganiserId != null) payload.organiser_id = resolvedOrganiserId;
      if (form.notes) payload.notes = form.notes;

      const { error } = await supabase.from("campaigns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["organisers"] });
      queryClient.invalidateQueries({ queryKey: ["user-profiles-staff-organiser-picker"] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  const columns = useMemo<Column<CampaignRow>[]>(() => {
    const base: Column<CampaignRow>[] = [
      { key: "name", header: "Name" },
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campaigns/new" className="flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                Campaign wizard
              </Link>
            </Button>
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (open) setOrganiserDialogKey((k) => k + 1);
              }}
            >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Create Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
                <DialogDescription>
                  Set up a new organising or bargaining campaign.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type *</Label>
                    <Select
                      value={form.campaign_type}
                      onValueChange={(v) => setForm({ ...form, campaign_type: v as CampaignType })}
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
                    <Label>Status *</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) => setForm({ ...form, status: v as CampaignStatus })}
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <CampaignOrganiserSelect
                  key={organiserDialogKey}
                  resetKey={organiserDialogKey}
                  label="Organiser"
                  value={form.organiser_id}
                  onChange={(v) => setForm({ ...form, organiser_id: v === "__none__" ? "" : v })}
                  allowNone
                  autoDefaultToCurrentUser
                />
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!form.name || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating…" : "Create Campaign"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      <DataTable<CampaignRow>
        data={campaigns}
        columns={columns}
        searchPlaceholder="Search campaigns…"
        searchKeys={["name"]}
        onRowClick={(row) => router.push(`/campaigns/${row.campaign_id}`)}
        loading={isLoading}
      />
    </div>
  );
}
