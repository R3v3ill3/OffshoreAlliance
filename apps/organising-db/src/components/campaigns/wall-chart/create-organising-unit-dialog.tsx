"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CampaignWorkerAssignmentPicker } from "@/components/campaigns/campaign-worker-assignment-picker";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useAuth } from "@/lib/supabase/auth-context";
import { createClient } from "@/lib/supabase/client";
import type { CampaignOuType } from "@/types/database";
import { FolderOpen, Layers, Users } from "lucide-react";

const OU_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "crew_rotation",
  "work_area",
  "network",
  "ethnic_community",
  "accommodation",
  "job_type",
  "worksite",
  "custom",
];

const OU_TYPE_LABELS: Record<string, string> = {
  shift: "Shift",
  department: "Department",
  crew_rotation: "Crew rotation",
  work_area: "Work area",
  network: "Network",
  ethnic_community: "Ethnic community",
  accommodation: "Accommodation",
  job_type: "Job type",
  worksite: "Worksite",
  employer: "Employer",
  custom: "Custom",
};

const GROUPABLE_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "crew_rotation",
  "work_area",
  "network",
  "ethnic_community",
  "accommodation",
  "custom",
];

type Mode = "single" | "group";
type WizardStep = "details" | "placement" | "workers" | "review";
type PlacementMode = "top" | "bottom" | "after";
type GroupPhase =
  | "choose_action"
  | "configure"
  | "define_members"
  | "add_to_existing";

interface ExistingOu {
  ou_id: number;
  ou_type: CampaignOuType;
  name: string;
  is_group_container: boolean;
  ou_group_id: number | null;
  parent_ou_id: number | null;
  display_order: number | null;
}

interface MemberEntry {
  key: string;
  name: string;
  estimate: string;
}

type DraftAssignmentTarget = {
  key: string;
  name: string;
  type: CampaignOuType;
  estimate: string;
};

type CreatedTarget = DraftAssignmentTarget & {
  ouId: number;
};

function parseEstimate(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
}

function topLevelLabel(ou: ExistingOu) {
  return ou.is_group_container ? `${ou.name} (group)` : ou.name;
}

function computeBlockOrder({
  existingOus,
  createdBlockIds,
  placementMode,
  placementAfterOuId,
}: {
  existingOus: ExistingOu[];
  createdBlockIds: number[];
  placementMode: PlacementMode;
  placementAfterOuId: string;
}) {
  const childrenByParent = new Map<number, ExistingOu[]>();
  for (const ou of existingOus) {
    if (ou.parent_ou_id == null) continue;
    const list = childrenByParent.get(ou.parent_ou_id) ?? [];
    list.push(ou);
    childrenByParent.set(ou.parent_ou_id, list);
  }
  for (const children of childrenByParent.values()) {
    children.sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) ||
        a.name.localeCompare(b.name)
    );
  }

  const blocks = existingOus
    .filter((ou) => ou.parent_ou_id == null)
    .sort(
      (a, b) =>
        (a.display_order ?? 0) - (b.display_order ?? 0) ||
        a.name.localeCompare(b.name)
    )
    .map((ou) => [
      ou.ou_id,
      ...(childrenByParent.get(ou.ou_id) ?? []).map((child) => child.ou_id),
    ]);

  if (placementMode === "top") return [createdBlockIds, ...blocks].flat();
  if (placementMode === "bottom") return [...blocks, createdBlockIds].flat();

  const anchorId = Number(placementAfterOuId);
  const anchorIndex = blocks.findIndex((block) => block[0] === anchorId);
  if (anchorIndex < 0) return [...blocks, createdBlockIds].flat();

  return [
    ...blocks.slice(0, anchorIndex + 1),
    createdBlockIds,
    ...blocks.slice(anchorIndex + 1),
  ].flat();
}

export function CreateOrganisingUnitDialog({
  open,
  onOpenChange,
  campaignId,
  displayOrder,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  displayOrder: number;
  onCreated?: (focusOuId: number) => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState<WizardStep>("details");
  const [mode, setMode] = useState<Mode>("single");
  const [singleName, setSingleName] = useState("");
  const [singleType, setSingleType] = useState<CampaignOuType>("shift");
  const [singleEstimate, setSingleEstimate] = useState("");
  const [groupPhase, setGroupPhase] = useState<GroupPhase>("configure");
  const [groupType, setGroupType] = useState<CampaignOuType>("shift");
  const [groupName, setGroupName] = useState("");
  const [groupMemberCount, setGroupMemberCount] = useState(3);
  const [groupMembers, setGroupMembers] = useState<MemberEntry[]>([]);
  const [existingGroupId, setExistingGroupId] = useState("");
  const [addUnitName, setAddUnitName] = useState("");
  const [addUnitEstimate, setAddUnitEstimate] = useState("");
  const [placementMode, setPlacementMode] = useState<PlacementMode>("bottom");
  const [placementAfterOuId, setPlacementAfterOuId] = useState("");
  const [activeAssignmentKey, setActiveAssignmentKey] = useState("");
  const [assignmentsByDraftKey, setAssignmentsByDraftKey] = useState<Record<string, Set<number>>>({});
  const [allocatedDraftKeys, setAllocatedDraftKeys] = useState<Set<string>>(new Set());

  const { data: existingOus = [] } = useQuery<ExistingOu[]>({
    queryKey: ["campaign-ous-for-create-dialog", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, ou_type, name, is_group_container, ou_group_id, parent_ou_id, display_order")
        .eq("campaign_id", Number(campaignId))
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExistingOu[];
    },
    enabled: !!user && open,
  });

  const groupContainersOfType = useMemo(
    () => existingOus.filter((ou) => ou.is_group_container && ou.ou_type === groupType),
    [existingOus, groupType]
  );

  const topLevelOus = useMemo(
    () => existingOus.filter((ou) => ou.parent_ou_id == null),
    [existingOus]
  );

  const draftAssignmentTargets = useMemo<DraftAssignmentTarget[]>(() => {
    if (mode === "single") {
      return singleName.trim()
        ? [{ key: "single", name: singleName.trim(), type: singleType, estimate: singleEstimate }]
        : [];
    }

    if (groupPhase === "add_to_existing") {
      const container = existingOus.find((ou) => ou.ou_id === Number(existingGroupId));
      return container && addUnitName.trim()
        ? [
            {
              key: "add-to-existing",
              name: addUnitName.trim(),
              type: container.ou_type,
              estimate: addUnitEstimate,
            },
          ]
        : [];
    }

    if (groupPhase !== "define_members") return [];
    return groupMembers
      .filter((member) => member.name.trim())
      .map((member) => ({
        key: member.key,
        name: member.name.trim(),
        type: groupType,
        estimate: member.estimate,
      }));
  }, [
    addUnitEstimate,
    addUnitName,
    existingGroupId,
    existingOus,
    groupMembers,
    groupPhase,
    groupType,
    mode,
    singleEstimate,
    singleName,
    singleType,
  ]);

  const activeAssignmentTarget =
    draftAssignmentTargets.find((target) => target.key === activeAssignmentKey) ??
    draftAssignmentTargets[0] ??
    null;

  const isAddToExisting = mode === "group" && groupPhase === "add_to_existing";
  const needsPlacement = !isAddToExisting;
  const canLeaveDetails =
    draftAssignmentTargets.length > 0 &&
    (mode === "single" ||
      groupPhase === "define_members" ||
      (groupPhase === "add_to_existing" && !!existingGroupId));
  const selectedAssignmentTotal = Object.values(assignmentsByDraftKey).reduce(
    (sum, selected) => sum + selected.size,
    0
  );
  const committedAssignmentTotal = draftAssignmentTargets.reduce((sum, target) => {
    if (!allocatedDraftKeys.has(target.key)) return sum;
    return sum + (assignmentsByDraftKey[target.key]?.size ?? 0);
  }, 0);
  const committedWorkerIdsForOtherTargets = useMemo(() => {
    const ids = new Set<number>();
    for (const target of draftAssignmentTargets) {
      if (target.key === activeAssignmentTarget?.key || !allocatedDraftKeys.has(target.key)) continue;
      for (const workerId of assignmentsByDraftKey[target.key] ?? []) {
        ids.add(workerId);
      }
    }
    return ids;
  }, [activeAssignmentTarget?.key, allocatedDraftKeys, assignmentsByDraftKey, draftAssignmentTargets]);
  const committedWorkerIdsInGroup = useMemo(() => {
    const ids = new Set<number>();
    for (const target of draftAssignmentTargets) {
      if (!allocatedDraftKeys.has(target.key)) continue;
      for (const workerId of assignmentsByDraftKey[target.key] ?? []) {
        ids.add(workerId);
      }
    }
    return ids;
  }, [allocatedDraftKeys, assignmentsByDraftKey, draftAssignmentTargets]);
  const hasUnallocatedSelections = draftAssignmentTargets.some(
    (target) => (assignmentsByDraftKey[target.key]?.size ?? 0) > 0 && !allocatedDraftKeys.has(target.key)
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ous-for-create-dialog", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
  };

  const createOrganisingUnits = useAuthAwareMutation<{ focusOuId: number }, Error, void>({
    mutationFn: async () => {
      if (draftAssignmentTargets.length === 0) throw new Error("Add at least one organising unit.");

      const createdTargets: CreatedTarget[] = [];
      const createdBlockIds: number[] = [];
      let focusOuId: number | null = null;

      if (mode === "single") {
        const estimate = parseEstimate(singleEstimate);
        const payload: Record<string, unknown> = {
          campaign_id: Number(campaignId),
          name: singleName.trim(),
          ou_type: singleType,
          display_order: displayOrder,
          source: "manual",
          is_group_container: false,
        };
        if (estimate !== undefined) payload.total_workers_estimated = estimate;

        const { data, error } = await supabase
          .from("campaign_organising_units")
          .insert(payload)
          .select("ou_id")
          .single();
        if (error) throw error;
        const ouId = data.ou_id as number;
        createdTargets.push({ key: "single", name: singleName.trim(), type: singleType, estimate: singleEstimate, ouId });
        createdBlockIds.push(ouId);
        focusOuId = ouId;
      } else if (groupPhase === "add_to_existing") {
        const containerOuId = Number(existingGroupId);
        const container = existingOus.find((ou) => ou.ou_id === containerOuId);
        if (!container || !addUnitName.trim()) throw new Error("Select a group and name the new unit.");
        const estimate = parseEstimate(addUnitEstimate);
        const payload: Record<string, unknown> = {
          campaign_id: Number(campaignId),
          name: addUnitName.trim(),
          ou_type: container.ou_type,
          display_order: displayOrder,
          source: "manual",
          is_group_container: false,
          parent_ou_id: containerOuId,
          ou_group_id: containerOuId,
          unit_basis: { custom: true },
        };
        if (estimate !== undefined) payload.total_workers_estimated = estimate;

        const { data, error } = await supabase
          .from("campaign_organising_units")
          .insert(payload)
          .select("ou_id")
          .single();
        if (error) throw error;
        const ouId = data.ou_id as number;
        createdTargets.push({
          key: "add-to-existing",
          name: addUnitName.trim(),
          type: container.ou_type,
          estimate: addUnitEstimate,
          ouId,
        });
        createdBlockIds.push(ouId);
        focusOuId = ouId;
      } else {
        if (!groupName.trim()) throw new Error("Name the group.");
        const { data: containerRow, error: containerErr } = await supabase
          .from("campaign_organising_units")
          .insert({
            campaign_id: Number(campaignId),
            name: groupName.trim(),
            ou_type: groupType,
            display_order: displayOrder,
            source: "manual",
            is_group_container: true,
          })
          .select("ou_id")
          .single();
        if (containerErr) throw containerErr;

        const containerOuId = containerRow.ou_id as number;
        createdBlockIds.push(containerOuId);
        focusOuId = containerOuId;

        const memberRows = draftAssignmentTargets.map((target, index) => {
          const row: Record<string, unknown> = {
            campaign_id: Number(campaignId),
            name: target.name,
            ou_type: groupType,
            display_order: displayOrder + 1 + index,
            source: "manual",
            is_group_container: false,
            parent_ou_id: containerOuId,
            ou_group_id: containerOuId,
            unit_basis: { custom: true },
          };
          const estimate = parseEstimate(target.estimate);
          if (estimate !== undefined) row.total_workers_estimated = estimate;
          return row;
        });

        const { data: createdMemberRows, error: memberErr } = await supabase
          .from("campaign_organising_units")
          .insert(memberRows)
          .select("ou_id");
        if (memberErr) throw memberErr;

        (createdMemberRows ?? []).forEach((row, index) => {
          const target = draftAssignmentTargets[index];
          if (!target) return;
          const ouId = row.ou_id as number;
          createdTargets.push({ ...target, ouId });
          createdBlockIds.push(ouId);
        });
      }

      if (needsPlacement && createdBlockIds.length > 0) {
        const orderedIds = computeBlockOrder({
          existingOus,
          createdBlockIds,
          placementMode,
          placementAfterOuId,
        });
        for (let index = 0; index < orderedIds.length; index++) {
          const { error } = await supabase
            .from("campaign_organising_units")
            .update({ display_order: index })
            .eq("ou_id", orderedIds[index]);
          if (error) throw error;
        }
      }

      const assignmentRows = createdTargets.flatMap((target) => {
        if (!allocatedDraftKeys.has(target.key)) return [];
        const selected = assignmentsByDraftKey[target.key] ?? new Set<number>();
        return [...selected].map((workerId) => ({
          ou_id: target.ouId,
          worker_id: workerId,
          is_primary: false,
          assignment_source: "manual",
        }));
      });
      if (assignmentRows.length > 0) {
        const { error } = await (supabase as unknown as {
          from: (table: string) => {
            insert: (rows: Record<string, unknown>[]) => Promise<{ error: Error | null }>;
          };
        })
          .from("campaign_worker_ou")
          .insert(assignmentRows);
        if (error) throw error;
      }

      const resolvedFocusOuId = focusOuId ?? createdTargets[0]?.ouId ?? createdBlockIds[0];
      if (resolvedFocusOuId == null) throw new Error("No organising unit was created.");
      return { focusOuId: resolvedFocusOuId };
    },
    onSuccess: (result) => {
      invalidate();
      onCreated?.(result.focusOuId);
      handleClose();
    },
  });

  function resetGroupState() {
    setGroupPhase("configure");
    setGroupName("");
    setGroupMemberCount(3);
    setGroupMembers([]);
    setExistingGroupId("");
    setAddUnitName("");
    setAddUnitEstimate("");
  }

  function handleClose() {
    onOpenChange(false);
    setStep("details");
    setMode("single");
    setSingleName("");
    setSingleType("shift");
    setSingleEstimate("");
    setPlacementMode("bottom");
    setPlacementAfterOuId("");
    setAssignmentsByDraftKey({});
    setActiveAssignmentKey("");
    setAllocatedDraftKeys(new Set());
    resetGroupState();
  }

  function handleGroupTypeChange(type: CampaignOuType) {
    setGroupType(type);
    const hasGroups = existingOus.some((ou) => ou.is_group_container && ou.ou_type === type);
    setGroupPhase(hasGroups ? "choose_action" : "configure");
    setGroupName("");
    setGroupMembers([]);
    setExistingGroupId("");
  }

  function proceedToDefineMembers() {
    const count = Math.max(2, Math.min(20, groupMemberCount));
    const label = OU_TYPE_LABELS[groupType] ?? groupType;
    setGroupMembers(
      Array.from({ length: count }, (_, index) => ({
        key: `m${index}`,
        name: `${label} ${index + 1}`,
        estimate: "",
      }))
    );
    setGroupPhase("define_members");
  }

  function goToWorkersStep() {
    if (!activeAssignmentKey && draftAssignmentTargets[0]) {
      setActiveAssignmentKey(draftAssignmentTargets[0].key);
    }
    setStep("workers");
  }

  function allocateActiveWorkers() {
    if (!activeAssignmentTarget) return;
    const selected = assignmentsByDraftKey[activeAssignmentTarget.key] ?? new Set<number>();
    const nextSelected = new Set(
      [...selected].filter((workerId) => !committedWorkerIdsForOtherTargets.has(workerId))
    );
    if (nextSelected.size === 0) return;

    setAssignmentsByDraftKey((prev) => ({
      ...prev,
      [activeAssignmentTarget.key]: nextSelected,
    }));

    const nextAllocated = new Set(allocatedDraftKeys);
    nextAllocated.add(activeAssignmentTarget.key);
    setAllocatedDraftKeys(nextAllocated);

    const nextTarget =
      draftAssignmentTargets.find(
        (target) => target.key !== activeAssignmentTarget.key && !nextAllocated.has(target.key)
      ) ??
      draftAssignmentTargets.find((target) => target.key !== activeAssignmentTarget.key) ??
      activeAssignmentTarget;
    setActiveAssignmentKey(nextTarget.key);
  }

  const isPending = createOrganisingUnits.isPending;
  const placementSummary =
    !needsPlacement
      ? "Inside the selected existing group"
      : placementMode === "top"
        ? "Top of the wall chart"
        : placementMode === "bottom"
          ? "Bottom of the wall chart"
          : `After ${
              topLevelOus.find((ou) => ou.ou_id === Number(placementAfterOuId))?.name ??
              "the selected unit"
            }`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New organising unit</DialogTitle>
          <DialogDescription>
            Create units, place them on the wall chart, and optionally assign campaign workers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["details", "1. Units"],
            ["placement", "2. Placement"],
            ["workers", "3. Workers"],
            ["review", "4. Review"],
          ].map(([value, label]) => (
            <Badge key={value} variant={step === value ? "default" : "outline"}>
              {label}
            </Badge>
          ))}
        </div>

        {step === "details" && (
          <>
            <div className="flex gap-1 rounded-md border p-1 bg-muted/30">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                  mode === "single"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="inline h-3 w-3 mr-1" />
                Single unit
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("group");
                  handleGroupTypeChange(groupType);
                }}
                className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                  mode === "group"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FolderOpen className="inline h-3 w-3 mr-1" />
                Group of units
              </button>
            </div>

            {mode === "single" && (
              <div className="grid gap-4 py-1">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={singleName}
                    onChange={(event) => setSingleName(event.target.value)}
                    placeholder="e.g. Day Shift"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={singleType} onValueChange={(value) => setSingleType(value as CampaignOuType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OU_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {OU_TYPE_LABELS[type] ?? type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Worker estimate (optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={singleEstimate}
                    onChange={(event) => setSingleEstimate(event.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>
            )}

            {mode === "group" && (
              <div className="space-y-4 py-1">
                <div className="space-y-2">
                  <Label>Unit type</Label>
                  <Select value={groupType} onValueChange={(value) => handleGroupTypeChange(value as CampaignOuType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GROUPABLE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {OU_TYPE_LABELS[type] ?? type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {groupPhase === "choose_action" && (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                    <p className="text-sm font-medium">{OU_TYPE_LABELS[groupType]} groups already exist.</p>
                    <p className="text-sm text-muted-foreground">
                      Are you adding a unit to an existing group, or creating a new group?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setGroupPhase("add_to_existing")}>
                        Add to existing group
                      </Button>
                      <Button type="button" size="sm" onClick={() => setGroupPhase("configure")}>
                        Create new group
                      </Button>
                    </div>
                  </div>
                )}

                {groupPhase === "configure" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Group name</Label>
                      <Input
                        value={groupName}
                        onChange={(event) => setGroupName(event.target.value)}
                        placeholder={
                          groupType === "shift"
                            ? "e.g. Offshore Shifts"
                            : groupType === "department"
                              ? "e.g. Maintenance Depts"
                              : "Group name"
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Workers in this group can move between units within it but not into units in a
                        different group of the same type.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Number of units in this group</Label>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0"
                          onClick={() => setGroupMemberCount((count) => Math.max(2, count - 1))}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center font-medium tabular-nums">{groupMemberCount}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 w-9 p-0"
                          onClick={() => setGroupMemberCount((count) => Math.min(20, count + 1))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <Button type="button" size="sm" onClick={proceedToDefineMembers} disabled={!groupName.trim()}>
                      Set up {groupMemberCount} units
                    </Button>
                  </div>
                )}

                {groupPhase === "define_members" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{groupName}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {OU_TYPE_LABELS[groupType]} group
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Name each unit in the group and optionally enter a worker estimate.
                    </p>
                    <div className="space-y-2 max-h-56 overflow-auto pr-1">
                      {groupMembers.map((member, index) => (
                        <div key={member.key} className="grid grid-cols-[1fr_72px] gap-2 items-center">
                          <Input
                            value={member.name}
                            onChange={(event) => {
                              const next = [...groupMembers];
                              next[index] = { ...member, name: event.target.value };
                              setGroupMembers(next);
                            }}
                            placeholder={`Unit ${index + 1} name`}
                            className="text-sm"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={member.estimate}
                            onChange={(event) => {
                              const next = [...groupMembers];
                              next[index] = { ...member, estimate: event.target.value };
                              setGroupMembers(next);
                            }}
                            placeholder="Est."
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setGroupPhase("configure")}>
                      Back
                    </Button>
                  </div>
                )}

                {groupPhase === "add_to_existing" && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Select group</Label>
                      <Select value={existingGroupId} onValueChange={setExistingGroupId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {groupContainersOfType.map((group) => (
                            <SelectItem key={group.ou_id} value={String(group.ou_id)}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-[1fr_72px] gap-2 items-end">
                      <div className="space-y-2">
                        <Label>New unit name</Label>
                        <Input
                          value={addUnitName}
                          onChange={(event) => setAddUnitName(event.target.value)}
                          placeholder={`e.g. ${groupType === "shift" ? "Night Shift" : "New unit"}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Est.</Label>
                        <Input
                          type="number"
                          min={0}
                          value={addUnitEstimate}
                          onChange={(event) => setAddUnitEstimate(event.target.value)}
                          placeholder="-"
                        />
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setGroupPhase("choose_action")}>
                      Back
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === "placement" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose where the new {mode === "group" ? "group" : "unit"} should appear. Groups are moved
              as a single block.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox checked={placementMode === "top"} onCheckedChange={() => setPlacementMode("top")} />
                <span className="text-sm font-medium">Place at the top</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox checked={placementMode === "bottom"} onCheckedChange={() => setPlacementMode("bottom")} />
                <span className="text-sm font-medium">Place at the bottom</span>
              </label>
              <div className="rounded-md border p-3 space-y-2">
                <label className="flex items-center gap-2">
                  <Checkbox checked={placementMode === "after"} onCheckedChange={() => setPlacementMode("after")} />
                  <span className="text-sm font-medium">Place between existing groups/units</span>
                </label>
                <Select
                  value={placementAfterOuId}
                  onValueChange={(value) => {
                    setPlacementAfterOuId(value);
                    setPlacementMode("after");
                  }}
                  disabled={topLevelOus.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Place after..." />
                  </SelectTrigger>
                  <SelectContent>
                    {topLevelOus.map((ou) => (
                      <SelectItem key={ou.ou_id} value={String(ou.ou_id)}>
                        After {topLevelLabel(ou)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === "workers" && (
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Assign workers to</p>
              {draftAssignmentTargets.map((target) => {
                const selectedCount = assignmentsByDraftKey[target.key]?.size ?? 0;
                const active = activeAssignmentTarget?.key === target.key;
                const allocated = allocatedDraftKeys.has(target.key);
                return (
                  <button
                    key={target.key}
                    type="button"
                    onClick={() => setActiveAssignmentKey(target.key)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="block font-medium">{target.name}</span>
                      {allocated && (
                        <Badge variant="secondary" className="text-[10px]">
                          Allocated
                        </Badge>
                      )}
                    </span>
                    <span className={active ? "text-primary-foreground/80" : "text-muted-foreground"}>
                      {selectedCount} selected
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              {activeAssignmentTarget ? (
                <>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Add workers to {activeAssignmentTarget.name}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="secondary">
                      {committedWorkerIdsInGroup.size} allocated in this group
                    </Badge>
                    <Badge variant="outline">
                      {draftAssignmentTargets.length} unit
                      {draftAssignmentTargets.length === 1 ? "" : "s"} in group
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Select workers for this unit, then click Allocate selected workers to save this unit&apos;s allocation before moving to the next unit. Workers allocated to another unit in this new group are hidden by default.
                  </p>
                  <CampaignWorkerAssignmentPicker
                    key={activeAssignmentTarget.key}
                    campaignId={campaignId}
                    targetOuId={null}
                    selectedWorkerIds={assignmentsByDraftKey[activeAssignmentTarget.key] ?? new Set<number>()}
                    onSelectedWorkerIdsChange={(next) => {
                      const cleaned = new Set(
                        [...next].filter((workerId) => !committedWorkerIdsForOtherTargets.has(workerId))
                      );
                      setAssignmentsByDraftKey((prev) => ({
                        ...prev,
                        [activeAssignmentTarget.key]: cleaned,
                      }));
                      setAllocatedDraftKeys((prev) => {
                        if (!prev.has(activeAssignmentTarget.key)) return prev;
                        const copy = new Set(prev);
                        copy.delete(activeAssignmentTarget.key);
                        return copy;
                      });
                    }}
                    unassignedFilterMode="target"
                    excludedWorkerIds={committedWorkerIdsForOtherTargets}
                    excludedWorkerLabel="Showing workers unallocated in this new group"
                    showUnallocatedElsewhereFilter
                    compact
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={allocateActiveWorkers}
                      disabled={(assignmentsByDraftKey[activeAssignmentTarget.key]?.size ?? 0) === 0}
                    >
                      Allocate selected workers
                    </Button>
                    {allocatedDraftKeys.has(activeAssignmentTarget.key) && (
                      <p className="text-xs text-muted-foreground">
                        Saved for {activeAssignmentTarget.name}. You can still change the selection and allocate again.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Set up a unit before assigning workers.</p>
              )}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Placement</p>
              <p className="text-sm text-muted-foreground">{placementSummary}</p>
            </div>
            <div className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">Units to create</p>
              {mode === "group" && groupPhase === "define_members" && (
                <p className="text-sm text-muted-foreground">Group container: {groupName}</p>
              )}
              <ul className="space-y-1">
                {draftAssignmentTargets.map((target) => {
                  const workerCount = assignmentsByDraftKey[target.key]?.size ?? 0;
                  return (
                    <li key={target.key} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {target.name}{" "}
                        <span className="text-muted-foreground">
                          ({OU_TYPE_LABELS[target.type] ?? target.type})
                        </span>
                      </span>
                      <Badge variant="outline">
                        {workerCount} worker{workerCount === 1 ? "" : "s"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              {committedAssignmentTotal} allocated worker assignment
              {committedAssignmentTotal === 1 ? "" : "s"} will be added after the units are created.
              {selectedAssignmentTotal > committedAssignmentTotal
                ? " Some selected workers have not been allocated yet."
                : ""}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>

          {step !== "details" && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                if (step === "placement") setStep("details");
                if (step === "workers") setStep(needsPlacement ? "placement" : "details");
                if (step === "review") setStep("workers");
              }}
            >
              Back
            </Button>
          )}

          {step === "details" && (
            <Button
              type="button"
              disabled={!canLeaveDetails || isPending}
              onClick={() => {
                if (needsPlacement) setStep("placement");
                else goToWorkersStep();
              }}
            >
              {needsPlacement ? "Next: placement" : "Next: add workers"}
            </Button>
          )}

          {step === "placement" && (
            <Button
              type="button"
              disabled={isPending || (placementMode === "after" && !placementAfterOuId && topLevelOus.length > 0)}
              onClick={goToWorkersStep}
            >
              Next: add workers
            </Button>
          )}

          {step === "workers" && (
            <Button
              type="button"
              disabled={isPending || hasUnallocatedSelections}
              onClick={() => setStep("review")}
              title={hasUnallocatedSelections ? "Allocate selected workers before reviewing" : undefined}
            >
              Next: review
            </Button>
          )}

          {step === "review" && (
            <Button
              type="button"
              disabled={isPending || draftAssignmentTargets.length === 0}
              onClick={() => createOrganisingUnits.mutate()}
            >
              {createOrganisingUnits.isPending ? "Creating..." : "Create units"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
