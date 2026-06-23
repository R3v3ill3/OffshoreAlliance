"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
} from "@/components/ui/dialog";
import { DataTable, type Column, type DataTableSelection } from "@/components/data-tables/data-table";
import {
  WorkerFilterBar,
  EMPTY_FILTERS,
  type WorkerFilters,
} from "@/components/workers/worker-filter-bar";
import type { CampaignOuType } from "@/types/organising-row-types";

interface AddWorkersClientProps {
  campaignId: number;
  campaignName: string;
}

interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_hsr: boolean | null;
  employer_id: number | null;
  worksite_id: number | null;
  union_membership_type_id: number | null;
  member_role_type_id: number | null;
  canonical_occupation_id: number | null;
  employer: { employer_name: string } | null;
  worksite: { worksite_name: string } | null;
  union_membership_type: { display_name: string } | null;
  member_role_type: { display_name: string } | null;
  [key: string]: unknown;
}

interface CampaignOuRow {
  ou_id: number;
  name: string;
  ou_type: string;
}

const OU_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "network",
  "job_type",
  "worksite",
  "ethnic_community",
  "crew_rotation",
  "accommodation",
  "work_area",
  "custom",
];

const OU_TYPE_LABELS: Record<CampaignOuType, string> = {
  shift: "Shift",
  department: "Department",
  network: "Network",
  job_type: "Job type",
  worksite: "Worksite",
  employer: "Employer",
  ethnic_community: "Ethnic community",
  crew_rotation: "Crew rotation",
  accommodation: "Accommodation",
  work_area: "Work area",
  custom: "Custom",
};

type UnitMode = "existing" | "new" | "unallocated";

export function AddWorkersClient({ campaignId, campaignName }: AddWorkersClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, canWrite } = useAuth();

  const [filters, setFilters] = useState<WorkerFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unitMode, setUnitMode] = useState<UnitMode>("unallocated");
  const [existingOuId, setExistingOuId] = useState<string>("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitType, setNewUnitType] = useState<CampaignOuType>("custom");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cid = String(campaignId);

  const { data: workers = [], isLoading: workersLoading } = useQuery({
    queryKey: ["add-workers-candidate-pool", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, email, phone, is_active, is_hsr,
           employer_id, worksite_id, union_membership_type_id, member_role_type_id,
           canonical_occupation_id,
           employer:employers(employer_name),
           worksite:worksites(worksite_name),
           union_membership_type:union_membership_types(display_name),
           member_role_type:member_role_types(display_name)`,
        )
        .order("last_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WorkerRow[];
    },
    enabled: !!user,
  });

  const { data: existingMemberIds } = useQuery({
    queryKey: ["add-workers-existing-membership", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return new Set((data ?? []).map((r: { worker_id: number }) => r.worker_id));
    },
    enabled: !!user,
  });

  // Distinct key — this only selects a column subset, so it must not share the
  // canonical ["campaign-ous", cid] cache (which carries the full OU shape used
  // for the group hierarchy on the wall chart / units views).
  const { data: campaignOus = [] } = useQuery({
    queryKey: ["campaign-ou-min", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, ou_type")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CampaignOuRow[];
    },
    enabled: !!user,
  });

  const candidatePool = useMemo(() => {
    if (!existingMemberIds) return workers;
    return workers.filter((w) => !existingMemberIds.has(w.worker_id));
  }, [workers, existingMemberIds]);

  const clientFiltered = useMemo(() => {
    let result = candidatePool;
    if (filters.employer_id != null)
      result = result.filter((w) => w.employer_id === filters.employer_id);
    if (filters.worksite_id != null)
      result = result.filter((w) => w.worksite_id === filters.worksite_id);
    if (filters.union_membership_type_id != null)
      result = result.filter(
        (w) => w.union_membership_type_id === filters.union_membership_type_id,
      );
    if (filters.member_role_type_id != null)
      result = result.filter(
        (w) => w.member_role_type_id === filters.member_role_type_id,
      );
    if (filters.is_active != null)
      result = result.filter((w) => w.is_active === filters.is_active);
    return result;
  }, [candidatePool, filters]);

  const applyFilter = useCallback((next: WorkerFilters) => {
    setFilters(next);
  }, []);

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      clientFiltered.forEach((w) => next.add(String(w.worker_id)));
      return next;
    });
  }, [clientFiltered]);

  const selection: DataTableSelection<WorkerRow> = {
    rowId: (w) => String(w.worker_id),
    selectedIds,
    onToggleRow: (id, selected) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (selected) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    onToggleAllVisible: (ids, selected) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
        return next;
      });
    },
  };

  const columns: Column<WorkerRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => `${row.first_name} ${row.last_name}`,
    },
    {
      key: "employer_name",
      header: "Employer",
      render: (row) => row.employer?.employer_name ?? "—",
    },
    {
      key: "worksite_name",
      header: "Worksite",
      render: (row) => row.worksite?.worksite_name ?? "—",
    },
    {
      key: "member_type",
      header: "Member type",
      render: (row) => row.union_membership_type?.display_name ?? "—",
    },
    {
      key: "role",
      header: "Organising role",
      render: (row) => row.member_role_type?.display_name ?? "—",
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  const selectedCount = selectedIds.size;
  const noUnitsExist = campaignOus.length === 0;

  const targetReady = (() => {
    if (selectedCount === 0) return false;
    if (unitMode === "unallocated") return true;
    if (unitMode === "existing") return !!existingOuId;
    if (unitMode === "new") return newUnitName.trim().length > 0;
    return false;
  })();

  const targetSummary = (() => {
    if (unitMode === "unallocated") return "no unit (unallocated)";
    if (unitMode === "existing") {
      const ou = campaignOus.find((o) => String(o.ou_id) === existingOuId);
      return ou ? `existing unit "${ou.name}"` : "existing unit";
    }
    if (unitMode === "new") return `new unit "${newUnitName.trim()}" (${OU_TYPE_LABELS[newUnitType]})`;
    return "";
  })();

  const submitMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const worker_ids = [...selectedIds].map(Number);
      const body: Record<string, unknown> = { unitMode, worker_ids };
      if (unitMode === "existing") body.ou_id = Number(existingOuId);
      if (unitMode === "new") {
        body.new_unit = { name: newUnitName.trim(), ou_type: newUnitType };
      }

      const res = await fetchApi(`/api/campaigns/${campaignId}/add-workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-member-ids", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-universe-employers", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-universe-worksites", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-workers-picker", cid] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wall-chart", cid] });
      queryClient.invalidateQueries({ queryKey: ["add-workers-existing-membership", campaignId] });
      router.push(`/campaigns/${campaignId}`);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to add workers");
      setConfirmOpen(false);
    },
  });

  if (!canWrite) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" asChild>
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to campaign
          </Link>
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You do not have permission to add workers to this campaign.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={`/campaigns/${campaignId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to campaign
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Add workers to {campaignName}</h1>
        <p className="text-sm text-muted-foreground">
          Filter, multi-select, and assign workers to this campaign. Workers already
          on this campaign are excluded automatically.
        </p>
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">
            {selectedCount} worker{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={selectAllFiltered}
          >
            Select all {clientFiltered.length} matching
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
            <X className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}

      <DataTable<WorkerRow>
        data={clientFiltered}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        searchKeys={["first_name", "last_name", "email"]}
        loading={workersLoading}
        selection={selection}
        filterBar={<WorkerFilterBar filters={filters} onChange={applyFilter} />}
      />

      {selectedCount > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Target</CardTitle>
            <CardDescription>
              Choose where the selected workers should be added.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={unitMode}
              onValueChange={(v) => setUnitMode(v as UnitMode)}
              className="space-y-3"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="unallocated" id="mode-unallocated" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-unallocated" className="font-medium cursor-pointer">
                    Add to campaign without an organising unit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Workers join the campaign membership but aren&apos;t assigned to a unit.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="existing"
                  id="mode-existing"
                  className="mt-1"
                  disabled={noUnitsExist}
                />
                <div className="flex-1">
                  <Label
                    htmlFor="mode-existing"
                    className={`font-medium ${noUnitsExist ? "text-muted-foreground" : "cursor-pointer"}`}
                  >
                    Add to an existing organising unit
                    {noUnitsExist && (
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        (no units exist for this campaign yet)
                      </span>
                    )}
                  </Label>
                  {unitMode === "existing" && !noUnitsExist && (
                    <div className="mt-2">
                      <Select value={existingOuId} onValueChange={setExistingOuId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a unit…" />
                        </SelectTrigger>
                        <SelectContent>
                          {campaignOus.map((ou) => (
                            <SelectItem key={ou.ou_id} value={String(ou.ou_id)}>
                              {ou.name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {OU_TYPE_LABELS[ou.ou_type as CampaignOuType] ?? ou.ou_type}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <RadioGroupItem value="new" id="mode-new" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="mode-new" className="font-medium cursor-pointer">
                    Create a new organising unit and add the workers to it
                  </Label>
                  {unitMode === "new" && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="new-unit-name" className="text-xs">Name</Label>
                        <Input
                          id="new-unit-name"
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder="e.g. Night shift mechanics"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <Label htmlFor="new-unit-type" className="text-xs">Type</Label>
                        <Select
                          value={newUnitType}
                          onValueChange={(v) => setNewUnitType(v as CampaignOuType)}
                        >
                          <SelectTrigger id="new-unit-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OU_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {OU_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {errorMessage && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={`/campaigns/${campaignId}`}>Cancel</Link>
        </Button>
        <Button
          disabled={!targetReady || submitMutation.isPending}
          onClick={() => {
            setErrorMessage(null);
            setConfirmOpen(true);
          }}
        >
          Review &amp; add
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {selectedCount} worker{selectedCount !== 1 ? "s" : ""} to{" "}
              {campaignName}?
            </DialogTitle>
            <DialogDescription>
              They will be assigned to {targetSummary}. This action is idempotent —
              workers already on the campaign or already in the target unit will be
              left untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitMutation.isPending}
            >
              Back
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? "Adding…" : "Add workers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
