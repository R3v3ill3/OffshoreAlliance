"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
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

interface CampaignRow {
  campaign_id: number;
  name: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  organiser: { organiser_name: string } | null;
  [key: string]: unknown;
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

const columns: Column<CampaignRow>[] = [
  { key: "name", header: "Name" },
  {
    key: "campaign_type",
    header: "Type",
    render: (row) => (
      <Badge variant={TYPE_VARIANT[row.campaign_type]}>
        {row.campaign_type}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={STATUS_VARIANT[row.status]}>
        {row.status}
      </Badge>
    ),
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
];

interface OrganiserOption {
  organiser_id: number;
  organiser_name: string;
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
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          `campaign_id, name, campaign_type, status, start_date, end_date,
           organiser:organisers(organiser_name)`
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as CampaignRow[];
    },
    enabled: !!user,
  });

  const { data: organisers = [] } = useQuery({
    queryKey: ["organisers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisers")
        .select("organiser_id, organiser_name")
        .eq("is_active", true)
        .order("organiser_name");
      return (data ?? []) as OrganiserOption[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        campaign_type: form.campaign_type,
        status: form.status,
      };
      if (form.description) payload.description = form.description;
      if (form.start_date) payload.start_date = form.start_date;
      if (form.end_date) payload.end_date = form.end_date;
      if (form.organiser_id) payload.organiser_id = Number(form.organiser_id);
      if (form.notes) payload.notes = form.notes;

      const { error } = await supabase.from("campaigns").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      setDialogOpen(false);
      setForm(INITIAL_FORM);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        {canWrite && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                <div className="space-y-2">
                  <Label>Organiser</Label>
                  <Select
                    value={form.organiser_id}
                    onValueChange={(v) => setForm({ ...form, organiser_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select organiser" />
                    </SelectTrigger>
                    <SelectContent>
                      {organisers.map((o) => (
                        <SelectItem key={o.organiser_id} value={String(o.organiser_id)}>
                          {o.organiser_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
