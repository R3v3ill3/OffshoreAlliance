"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCampaignMembershipStatus,
  type CampaignMembershipStatus,
} from "@/lib/campaign/constants";
import { createClient } from "@/lib/supabase/client";
import { formatWorkerLabel } from "@/lib/workers/format-worker-label";

type MemberWorkerRow = {
  worker_id: number;
  first_name: string | null;
  last_name: string | null;
  preferred_name?: string | null;
  is_bargaining_rep?: boolean | null;
  employer?: { employer_name?: string | null } | { employer_name?: string | null }[] | null;
  worksite?: { worksite_name?: string | null } | { worksite_name?: string | null }[] | null;
  member_role_type?: { role_name?: string | null } | { role_name?: string | null }[] | null;
  union_membership_type?: { type_name?: string | null } | { type_name?: string | null }[] | null;
};

type CampaignMemberRow = {
  membership_id: number;
  worker_id: number;
  worker: MemberWorkerRow | MemberWorkerRow[] | null;
};

type OuAssignmentRow = {
  ou_id: number;
  worker_id: number;
};

export type AssignableCampaignWorker = {
  membership_id: number;
  worker_id: number;
  label: string;
  employer_name: string;
  worksite_name: string;
  organising_role: string;
  membership_status: CampaignMembershipStatus;
  unit_count: number;
  is_multi_unit_member: boolean;
  is_already_assigned: boolean;
};

function normalizeMemberWorker(member: CampaignMemberRow): {
  worker_id: number;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  employer_name: string | null;
  worksite_name: string | null;
  member_role_name: string | null;
  union_membership_type_name: string | null;
  is_bargaining_rep: boolean | null;
} | null {
  const rawWorker = member.worker;
  const worker = (Array.isArray(rawWorker) ? rawWorker[0] : rawWorker) as MemberWorkerRow | null;
  if (!worker) return null;
  const employer = Array.isArray(worker.employer) ? worker.employer[0] : worker.employer;
  const worksite = Array.isArray(worker.worksite) ? worker.worksite[0] : worker.worksite;
  const memberRole = Array.isArray(worker.member_role_type)
    ? worker.member_role_type[0]
    : worker.member_role_type;
  const unionMembershipType = Array.isArray(worker.union_membership_type)
    ? worker.union_membership_type[0]
    : worker.union_membership_type;

  return {
    worker_id: member.worker_id,
    first_name: worker.first_name ?? null,
    last_name: worker.last_name ?? null,
    preferred_name: worker.preferred_name ?? null,
    employer_name: employer?.employer_name ?? null,
    worksite_name: worksite?.worksite_name ?? null,
    member_role_name: memberRole?.role_name ?? null,
    union_membership_type_name: unionMembershipType?.type_name ?? null,
    is_bargaining_rep: worker.is_bargaining_rep ?? null,
  };
}

function workerDisplayName(worker: NonNullable<ReturnType<typeof normalizeMemberWorker>>) {
  return formatWorkerLabel(worker.worker_id, {
    first_name: worker.first_name,
    last_name: worker.last_name,
    preferred_name: worker.preferred_name,
  });
}

export function CampaignWorkerAssignmentPicker({
  campaignId,
  targetOuId,
  selectedWorkerIds,
  onSelectedWorkerIdsChange,
  showPrimaryCheckbox = false,
  assignPrimary = false,
  onAssignPrimaryChange,
  unassignedFilterMode = "target",
  excludedWorkerIds,
  compact = false,
  feedback,
}: {
  campaignId: string;
  targetOuId?: number | null;
  selectedWorkerIds: Set<number>;
  onSelectedWorkerIdsChange: (next: Set<number>) => void;
  showPrimaryCheckbox?: boolean;
  assignPrimary?: boolean;
  onAssignPrimaryChange?: (next: boolean) => void;
  /**
   * `target` mirrors Campaign Units: hide workers already assigned to this OU.
   * `any` is better for pre-create wizard drafts: hide workers already in any OU.
   */
  unassignedFilterMode?: "target" | "any";
  /** Hide workers already committed to another draft target in the current flow. */
  excludedWorkerIds?: Set<number>;
  compact?: boolean;
  feedback?: string | null;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [employerFilter, setEmployerFilter] = useState("__all__");
  const [worksiteFilter, setWorksiteFilter] = useState("__all__");
  const [roleFilter, setRoleFilter] = useState("__all__");
  const [membershipFilter, setMembershipFilter] = useState("__all__");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [sortBy, setSortBy] = useState<"name" | "employer" | "worksite" | "role" | "unit_count">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id,
           worker:workers(
             worker_id, first_name, last_name, preferred_name, is_bargaining_rep,
             employer:employers(employer_name),
             worksite:worksites(worksite_name),
             member_role_type:member_role_types(role_name),
             union_membership_type:union_membership_types(type_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as CampaignMemberRow[];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as { ou_id: number }[];
    },
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");

  const { data: ouAssignments = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ouIds = ous.map((o) => o.ou_id);
      if (ouIds.length === 0) return [] as OuAssignmentRow[];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id")
        .in("ou_id", ouIds);
      if (error) throw error;
      return (data ?? []) as OuAssignmentRow[];
    },
    enabled: ous.length > 0,
  });

  const memberUnitCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of ouAssignments) {
      counts.set(row.worker_id, (counts.get(row.worker_id) ?? 0) + 1);
    }
    return counts;
  }, [ouAssignments]);

  const targetAssignedWorkerIds = useMemo(() => {
    if (targetOuId == null) return new Set<number>();
    return new Set(
      ouAssignments
        .filter((row) => row.ou_id === targetOuId)
        .map((row) => row.worker_id)
    );
  }, [ouAssignments, targetOuId]);

  const rows = useMemo<AssignableCampaignWorker[]>(() => {
    return members
      .map((member) => {
        const normalized = normalizeMemberWorker(member);
        if (!normalized) return null;
        const membershipStatus = getCampaignMembershipStatus({
          memberRoleName: normalized.member_role_name ?? undefined,
          unionMembershipTypeName: normalized.union_membership_type_name ?? undefined,
          isBargainingRep: normalized.is_bargaining_rep,
        });
        const unitCount = memberUnitCount.get(normalized.worker_id) ?? 0;
        return {
          membership_id: member.membership_id,
          worker_id: normalized.worker_id,
          label: workerDisplayName(normalized),
          employer_name: normalized.employer_name ?? "—",
          worksite_name: normalized.worksite_name ?? "—",
          organising_role: normalized.member_role_name ?? "none",
          membership_status: membershipStatus,
          unit_count: unitCount,
          is_multi_unit_member: unitCount > 1,
          is_already_assigned: targetAssignedWorkerIds.has(normalized.worker_id),
        };
      })
      .filter((row): row is AssignableCampaignWorker => !!row);
  }, [members, memberUnitCount, targetAssignedWorkerIds]);

  const employerOptions = useMemo(
    () => [...new Set(rows.map((m) => m.employer_name).filter(Boolean))],
    [rows]
  );
  const worksiteOptions = useMemo(
    () => [...new Set(rows.map((m) => m.worksite_name).filter(Boolean))],
    [rows]
  );

  const filteredWorkers = useMemo(() => {
    const loweredSearch = search.trim().toLowerCase();
    const filtered = rows.filter((worker) => {
      if (employerFilter !== "__all__" && worker.employer_name !== employerFilter) return false;
      if (worksiteFilter !== "__all__" && worker.worksite_name !== worksiteFilter) return false;
      if (roleFilter !== "__all__" && worker.organising_role !== roleFilter) return false;
      if (membershipFilter !== "__all__" && worker.membership_status !== membershipFilter) return false;
      if (
        showOnlyUnassigned &&
        (unassignedFilterMode === "any" ? worker.unit_count > 0 : worker.is_already_assigned)
      ) {
        return false;
      }
      if (excludedWorkerIds?.has(worker.worker_id) && !selectedWorkerIds.has(worker.worker_id)) {
        return false;
      }
      if (loweredSearch && !worker.label.toLowerCase().includes(loweredSearch)) return false;
      return true;
    });

    const sortFactor = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const safeCompare = (left: string | number, right: string | number) =>
        left < right ? -1 : left > right ? 1 : 0;
      if (sortBy === "employer") return safeCompare(a.employer_name, b.employer_name) * sortFactor;
      if (sortBy === "worksite") return safeCompare(a.worksite_name, b.worksite_name) * sortFactor;
      if (sortBy === "role") return safeCompare(a.organising_role, b.organising_role) * sortFactor;
      if (sortBy === "unit_count") return safeCompare(a.unit_count, b.unit_count) * sortFactor;
      return safeCompare(a.label, b.label) * sortFactor;
    });
  }, [
    employerFilter,
    membershipFilter,
    roleFilter,
    rows,
    search,
    showOnlyUnassigned,
    sortBy,
    sortDir,
    excludedWorkerIds,
    selectedWorkerIds,
    unassignedFilterMode,
    worksiteFilter,
  ]);

  const selectedAlreadyAssignedCount = useMemo(
    () => [...selectedWorkerIds].filter((id) => targetAssignedWorkerIds.has(id)).length,
    [selectedWorkerIds, targetAssignedWorkerIds]
  );
  const selectedCount = selectedWorkerIds.size;
  const selectedNewCount = selectedCount - selectedAlreadyAssignedCount;
  const allFilteredSelected =
    filteredWorkers.length > 0 &&
    filteredWorkers.every((worker) => selectedWorkerIds.has(worker.worker_id));

  const toggleSelectFiltered = () => {
    const next = new Set(selectedWorkerIds);
    if (allFilteredSelected) {
      filteredWorkers.forEach((worker) => next.delete(worker.worker_id));
    } else {
      filteredWorkers.forEach((worker) => next.add(worker.worker_id));
    }
    onSelectedWorkerIdsChange(next);
  };

  const toggleSelectOne = (workerId: number) => {
    const next = new Set(selectedWorkerIds);
    if (next.has(workerId)) next.delete(workerId);
    else next.add(workerId);
    onSelectedWorkerIdsChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <Input
          placeholder="Search workers..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select value={employerFilter} onValueChange={setEmployerFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Employer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All employers</SelectItem>
            {employerOptions.map((employer) => (
              <SelectItem key={employer} value={employer}>
                {employer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={worksiteFilter} onValueChange={setWorksiteFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Worksite" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All worksites</SelectItem>
            {worksiteOptions.map((worksite) => (
              <SelectItem key={worksite} value={worksite}>
                {worksite}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger>
            <SelectValue placeholder="OA role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All OA roles</SelectItem>
            <SelectItem value="delegate">Delegate</SelectItem>
            <SelectItem value="activist">Activist</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
        <Select value={membershipFilter} onValueChange={setMembershipFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Membership" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All membership</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="member_pending">Member - pending</SelectItem>
            <SelectItem value="non_member">Non-members</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={showOnlyUnassigned}
              onCheckedChange={(checked) => setShowOnlyUnassigned(checked === true)}
            />
            Show only unassigned workers
          </label>
          {showPrimaryCheckbox && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={assignPrimary}
                onCheckedChange={(checked) => onAssignPrimaryChange?.(checked === true)}
                disabled={selectedCount > 1}
              />
              Set as primary (single worker only)
            </label>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="employer">Employer</SelectItem>
              <SelectItem value="worksite">Worksite</SelectItem>
              <SelectItem value="role">OA role</SelectItem>
              <SelectItem value="unit_count">Unit count</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(value) => setSortDir(value as typeof sortDir)}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Ascending</SelectItem>
              <SelectItem value="desc">Descending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className={`rounded-md border overflow-auto ${compact ? "max-h-64" : "max-h-80"}`}>
        <div className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{selectedCount} selected</Badge>
            <Badge variant="outline">{filteredWorkers.length} in view</Badge>
            <Badge variant={selectedAlreadyAssignedCount > 0 ? "warning" : "outline"}>
              {selectedAlreadyAssignedCount} already assigned
            </Badge>
            <Badge variant={selectedNewCount > 0 ? "info" : "outline"}>
              {selectedNewCount} new assignments
            </Badge>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleSelectFiltered}
                  aria-label="Select all filtered workers"
                />
              </TableHead>
              <TableHead>Worker</TableHead>
              <TableHead>Employer</TableHead>
              <TableHead>Worksite</TableHead>
              <TableHead>OA role</TableHead>
              <TableHead>Units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membersLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">
                  Loading campaign workers...
                </TableCell>
              </TableRow>
            ) : filteredWorkers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">
                  No workers match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredWorkers.map((worker) => (
                <TableRow key={worker.worker_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedWorkerIds.has(worker.worker_id)}
                      onCheckedChange={() => toggleSelectOne(worker.worker_id)}
                      aria-label={`Select ${worker.label}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {worker.label}
                    {worker.is_already_assigned && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        already assigned
                      </Badge>
                    )}
                    {worker.is_multi_unit_member && (
                      <Badge variant="warning" className="ml-2 text-[10px]">
                        multi-unit
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{worker.employer_name}</TableCell>
                  <TableCell className="text-xs">{worker.worksite_name}</TableCell>
                  <TableCell className="text-xs capitalize">{worker.organising_role}</TableCell>
                  <TableCell className="text-xs">{worker.unit_count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
      <p className="text-xs text-muted-foreground">
        {selectedCount} selected - {selectedAlreadyAssignedCount} already assigned - {selectedNewCount} new
      </p>
    </div>
  );
}
