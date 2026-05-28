"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  Layers,
  FolderOpen,
  Users,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import type {
  CampaignOuType,
  CampaignOuUnitBasis,
} from "@/types/database";

// ─── Draft types ─────────────────────────────────────────────────────────────

export interface CampaignUnitDraft {
  /** Local-only id used to track the row in React state until saved. */
  draft_id: string;
  /** Server id once saved (PUT-style edits). null for newly added units. */
  ou_id: number | null;
  ou_type: CampaignOuType;
  name: string;
  total_workers_estimated: number | null;
  unit_basis: CampaignOuUnitBasis | null;
  /** Local draft id of the parent unit / group container, when this is a sub-unit or group member. */
  parent_draft_id?: string | null;
  /** Server id of the parent unit / group container, set after the parent has been saved. */
  parent_ou_id?: number | null;
  /**
   * TRUE when this draft represents a named group container OU.
   * Workers are never assigned directly to containers; only to their members.
   */
  is_group_container?: boolean;
  /**
   * Server id of the group container this unit belongs to.
   * Mirrors parent_ou_id for group members; null for containers and standalone units.
   * Set after save (when parent_ou_id is resolved).
   */
  ou_group_id?: number | null;
}

// ─── Pending group allocation map ─────────────────────────────────────────────
// Maps member unit draft_id → Set of worker_ids allocated to that unit.
// Used by the inline allocation panel in step 5. On save, draft_ids are
// resolved to real ou_ids and merged into workerUnitAllocations for step 6.
export type PendingGroupAllocations = Record<string, Set<number>>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface StepCampaignUnitsProps {
  campaignId: number | null;
  selectedEmployers: number[];
  selectedWorksites: number[];
  worksiteSectorWide: boolean;
  totalWorkerEstimate: number | null;
  units: CampaignUnitDraft[];
  setUnits: (next: CampaignUnitDraft[]) => void;
  /** Worker pre-allocations keyed by member-unit draft_id → Set<worker_id>. */
  pendingGroupAllocations: PendingGroupAllocations;
  setPendingGroupAllocations: (next: PendingGroupAllocations) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
  showBackButton?: boolean;
  continueLabel?: string;
}

// ─── Reference data interfaces ────────────────────────────────────────────────

interface EmployerLookup {
  employer_id: number;
  employer_name: string;
}

interface WorksiteLookup {
  worksite_id: number;
  worksite_name: string;
}

interface OccupationGroupLookup {
  group_id: number;
  name: string;
}

interface OccupationLookup {
  occupation_id: number;
  canonical_name: string;
  occupation_group_id: number | null;
}

interface WorkerRow {
  worker_id: number;
  first_name: string;
  last_name: string;
  employer_id: number | null;
  worksite_id: number | null;
  employer_name: string | null;
  worksite_name: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export const OU_TYPE_LABELS: Record<string, string> = {
  worksite: "Worksite",
  employer: "Employer",
  job_type: "Job type",
  shift: "Shift",
  department: "Department",
  network: "Network",
  work_area: "Work area",
  ethnic_community: "Ethnic community",
  crew_rotation: "Crew rotation",
  accommodation: "Accommodation",
  custom: "Custom",
};

// Types where adding multiple units as a named group is the natural workflow.
const GROUPABLE_OU_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "crew_rotation",
  "work_area",
  "network",
  "ethnic_community",
  "accommodation",
  "custom",
];

// ─── Group creation phase state ───────────────────────────────────────────────

type GroupCreationPhase =
  | null
  | "choose_action"   // Type has existing groups → ask: add-to-existing or create-new
  | "configure"       // Enter group name + member count
  | "define_members"  // Name + estimate each member unit
  | "add_to_existing"; // Add a single new unit to an existing group

interface MemberEntry {
  draft_member_id: string;
  name: string;
  estimate: number | null;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function StepCampaignUnits({
  campaignId,
  selectedEmployers,
  selectedWorksites,
  worksiteSectorWide,
  totalWorkerEstimate,
  units,
  setUnits,
  pendingGroupAllocations,
  setPendingGroupAllocations,
  isPending,
  onBack,
  onContinue,
  showBackButton = true,
  continueLabel,
}: StepCampaignUnitsProps) {
  const supabase = createClient();
  const { user } = useAuth();

  // ── Reference data ────────────────────────────────────────────────────────

  const { data: employers = [] } = useQuery<EmployerLookup[]>({
    queryKey: ["units-employers", selectedEmployers],
    queryFn: async () => {
      if (selectedEmployers.length === 0) return [];
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .in("employer_id", selectedEmployers)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && selectedEmployers.length > 0,
  });

  const { data: worksites = [] } = useQuery<WorksiteLookup[]>({
    queryKey: ["units-worksites", selectedWorksites],
    queryFn: async () => {
      if (selectedWorksites.length === 0) return [];
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .in("worksite_id", selectedWorksites)
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && selectedWorksites.length > 0 && !worksiteSectorWide,
  });

  const { data: occupationGroups = [] } = useQuery<OccupationGroupLookup[]>({
    queryKey: ["units-occupation-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupation_groups")
        .select("group_id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: occupations = [] } = useQuery<OccupationLookup[]>({
    queryKey: ["units-occupations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name, occupation_group_id")
        .order("canonical_name")
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Campaign workers for inline group allocation (only fetched when needed).
  const { data: campaignWorkers = [] } = useQuery<WorkerRow[]>({
    queryKey: ["step5-workers", campaignId, selectedEmployers, selectedWorksites, worksiteSectorWide],
    queryFn: async () => {
      if (!campaignId) return [];
      let q = supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name, employer_id, worksite_id,
           employers:employer_id(employer_name),
           worksites:worksite_id(worksite_name)`
        )
        .eq("is_active", true);
      if (selectedEmployers.length > 0) q = q.in("employer_id", selectedEmployers);
      if (selectedWorksites.length > 0 && !worksiteSectorWide)
        q = q.in("worksite_id", selectedWorksites);
      const { data, error } = await q.order("last_name").limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        worker_id: number;
        first_name: string;
        last_name: string;
        employer_id: number | null;
        worksite_id: number | null;
        employers: { employer_name: string } | null;
        worksites: { worksite_name: string } | null;
      }>;
      return rows.map((r) => ({
        worker_id: r.worker_id,
        first_name: r.first_name,
        last_name: r.last_name,
        employer_id: r.employer_id,
        worksite_id: r.worksite_id,
        employer_name: r.employers?.employer_name ?? null,
        worksite_name: r.worksites?.worksite_name ?? null,
      }));
    },
    enabled: !!user && !!campaignId && (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide),
  });

  // ── Scope-based unit toggles ──────────────────────────────────────────────

  const useEmployersAsUnits = useMemo(
    () =>
      selectedEmployers.length > 0 &&
      selectedEmployers.every((eid) =>
        units.some(
          (u) => u.ou_type === "employer" && u.unit_basis?.employer_id === eid
        )
      ),
    [units, selectedEmployers]
  );

  const useWorksitesAsUnits = useMemo(
    () =>
      !worksiteSectorWide &&
      selectedWorksites.length > 0 &&
      selectedWorksites.every((wid) =>
        units.some(
          (u) => u.ou_type === "worksite" && u.unit_basis?.worksite_id === wid
        )
      ),
    [units, selectedWorksites, worksiteSectorWide]
  );

  function toggleEmployersAsUnits(on: boolean) {
    if (on) {
      const existingEmployerIds = new Set(
        units
          .filter((u) => u.ou_type === "employer")
          .map((u) => u.unit_basis?.employer_id)
          .filter(Boolean)
      );
      const newEmployers = employers.filter(
        (e) => !existingEmployerIds.has(e.employer_id)
      );
      const estimateEach =
        totalWorkerEstimate != null && employers.length > 0
          ? Math.round(totalWorkerEstimate / employers.length)
          : null;
      const additions: CampaignUnitDraft[] = newEmployers.map((e) => ({
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "employer",
        name: e.employer_name,
        total_workers_estimated: estimateEach,
        unit_basis: { employer_id: e.employer_id },
      }));
      setUnits([...units, ...additions]);
    } else {
      setUnits(units.filter((u) => u.ou_type !== "employer"));
    }
  }

  function toggleWorksitesAsUnits(on: boolean) {
    if (on) {
      const existingWorksiteIds = new Set(
        units
          .filter((u) => u.ou_type === "worksite")
          .map((u) => u.unit_basis?.worksite_id)
          .filter(Boolean)
      );
      const newWorksites = worksites.filter(
        (w) => !existingWorksiteIds.has(w.worksite_id)
      );
      const estimateEach =
        totalWorkerEstimate != null && worksites.length > 0
          ? Math.round(totalWorkerEstimate / worksites.length)
          : null;
      const additions: CampaignUnitDraft[] = newWorksites.map((w) => ({
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "worksite",
        name: w.worksite_name,
        total_workers_estimated: estimateEach,
        unit_basis: { worksite_id: w.worksite_id },
      }));
      setUnits([...units, ...additions]);
    } else {
      setUnits(units.filter((u) => u.ou_type !== "worksite"));
    }
  }

  // ── Legacy single-unit add (occupation_group / occupation / custom) ────────

  const [pendingKind, setPendingKind] = useState<
    "occupation_group" | "occupation" | "custom"
  >("occupation_group");
  const [pendingPick, setPendingPick] = useState<string>("");
  const [pendingCustomName, setPendingCustomName] = useState("");

  function addPendingUnit() {
    if (pendingKind === "custom") {
      const name = pendingCustomName.trim();
      if (!name) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "custom",
          name,
          total_workers_estimated: null,
          unit_basis: { custom: true },
        },
      ]);
      setPendingCustomName("");
      return;
    }

    if (pendingKind === "occupation_group") {
      const groupId = Number(pendingPick);
      if (!groupId) return;
      const group = occupationGroups.find((g) => g.group_id === groupId);
      if (!group) return;
      const exists = units.some(
        (u) =>
          u.ou_type === "job_type" &&
          u.unit_basis?.occupation_group_id === groupId
      );
      if (exists) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "job_type",
          name: group.name,
          total_workers_estimated: null,
          unit_basis: { occupation_group_id: groupId },
        },
      ]);
      setPendingPick("");
      return;
    }

    if (pendingKind === "occupation") {
      const occId = Number(pendingPick);
      if (!occId) return;
      const occ = occupations.find((o) => o.occupation_id === occId);
      if (!occ) return;
      const exists = units.some(
        (u) =>
          u.ou_type === "job_type" &&
          u.unit_basis?.canonical_occupation_id === occId
      );
      if (exists) return;
      setUnits([
        ...units,
        {
          draft_id: newDraftId(),
          ou_id: null,
          ou_type: "job_type",
          name: occ.canonical_name,
          total_workers_estimated: null,
          unit_basis: { canonical_occupation_id: occId },
        },
      ]);
      setPendingPick("");
      return;
    }
  }

  // ── Group creation state ──────────────────────────────────────────────────

  const [groupPhase, setGroupPhase] = useState<GroupCreationPhase>(null);
  const [groupSelectedType, setGroupSelectedType] = useState<CampaignOuType>("shift");
  const [groupName, setGroupName] = useState("");
  const [groupMemberCount, setGroupMemberCount] = useState(3);
  const [groupMembers, setGroupMembers] = useState<MemberEntry[]>([]);
  // For "add to existing group" flow
  const [groupTargetDraftId, setGroupTargetDraftId] = useState<string>("");
  const [addToGroupUnitName, setAddToGroupUnitName] = useState("");
  const [addToGroupUnitEstimate, setAddToGroupUnitEstimate] = useState<number | null>(null);

  function startGroupCreation(type: CampaignOuType) {
    setGroupSelectedType(type);
    setGroupName("");
    setGroupMemberCount(3);
    setGroupMembers([]);
    setGroupTargetDraftId("");
    setAddToGroupUnitName("");
    setAddToGroupUnitEstimate(null);

    // Check if there are existing groups of this type
    const existingGroupContainers = units.filter(
      (u) => u.is_group_container && u.ou_type === type
    );
    if (existingGroupContainers.length > 0) {
      setGroupPhase("choose_action");
    } else {
      setGroupPhase("configure");
    }
  }

  function cancelGroupCreation() {
    setGroupPhase(null);
  }

  function proceedToDefineMembers() {
    const count = Math.max(2, Math.min(20, groupMemberCount));
    const typeName = OU_TYPE_LABELS[groupSelectedType] ?? groupSelectedType;
    const entries: MemberEntry[] = Array.from({ length: count }, (_, i) => ({
      draft_member_id: newDraftId(),
      name: `${typeName} ${i + 1}`,
      estimate: null,
    }));
    setGroupMembers(entries);
    setGroupPhase("define_members");
  }

  function confirmGroup() {
    if (!groupName.trim() || groupMembers.length === 0) return;

    const containerDraftId = newDraftId();
    const container: CampaignUnitDraft = {
      draft_id: containerDraftId,
      ou_id: null,
      ou_type: groupSelectedType,
      name: groupName.trim(),
      total_workers_estimated: null,
      unit_basis: { custom: true },
      is_group_container: true,
    };

    const members: CampaignUnitDraft[] = groupMembers.map((m) => ({
      draft_id: m.draft_member_id,
      ou_id: null,
      ou_type: groupSelectedType,
      name: m.name,
      total_workers_estimated: m.estimate,
      unit_basis: { custom: true },
      parent_draft_id: containerDraftId,
      is_group_container: false,
    }));

    setUnits([...units, container, ...members]);
    setGroupPhase(null);
  }

  function confirmAddToExistingGroup() {
    if (!groupTargetDraftId || !addToGroupUnitName.trim()) return;
    const container = units.find((u) => u.draft_id === groupTargetDraftId);
    if (!container) return;

    const newMember: CampaignUnitDraft = {
      draft_id: newDraftId(),
      ou_id: null,
      ou_type: container.ou_type,
      name: addToGroupUnitName.trim(),
      total_workers_estimated: addToGroupUnitEstimate,
      unit_basis: { custom: true },
      parent_draft_id: groupTargetDraftId,
      parent_ou_id: container.ou_id,
      is_group_container: false,
    };

    setUnits([...units, newMember]);
    setGroupPhase(null);
  }

  // ── Unit mutations ────────────────────────────────────────────────────────

  function removeUnit(draftId: string) {
    const removed = new Set<string>();
    removed.add(draftId);
    // Cascade to children (group members or sub-units)
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of units) {
        if (u.parent_draft_id && removed.has(u.parent_draft_id) && !removed.has(u.draft_id)) {
          removed.add(u.draft_id);
          changed = true;
        }
      }
    }
    setUnits(units.filter((u) => !removed.has(u.draft_id)));
    // Clean up any pending group allocations for removed members
    if (Object.keys(pendingGroupAllocations).some((k) => removed.has(k))) {
      const next = { ...pendingGroupAllocations };
      for (const k of removed) delete next[k];
      setPendingGroupAllocations(next);
    }
  }

  function updateUnit(draftId: string, partial: Partial<CampaignUnitDraft>) {
    setUnits(
      units.map((u) => (u.draft_id === draftId ? { ...u, ...partial } : u))
    );
  }

  function addSubUnit(parentDraftId: string) {
    const parent = units.find((u) => u.draft_id === parentDraftId);
    if (!parent) return;
    setUnits([
      ...units,
      {
        draft_id: newDraftId(),
        ou_id: null,
        ou_type: "custom",
        name: `${parent.name || "Unit"} – sub-unit`,
        total_workers_estimated: null,
        unit_basis: parent.ou_id
          ? { parent_ou_id: parent.ou_id, dimension: "custom" }
          : { dimension: "custom" },
        parent_draft_id: parentDraftId,
        parent_ou_id: parent.ou_id ?? null,
      },
    ]);
  }

  // ── Estimate sums per dimension ───────────────────────────────────────────

  const dimensions = useMemo(
    () => [...new Set(units.map((u) => u.ou_type))],
    [units]
  );

  const dimensionEstimates = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of units) {
      if (u.is_group_container) continue; // containers don't hold estimates
      if (typeof u.total_workers_estimated !== "number") continue;
      map.set(u.ou_type, (map.get(u.ou_type) ?? 0) + u.total_workers_estimated);
    }
    return map;
  }, [units]);

  const overDimensions = useMemo(() => {
    if (totalWorkerEstimate == null) return [] as string[];
    return Array.from(dimensionEstimates.entries())
      .filter(([, sum]) => sum > totalWorkerEstimate)
      .map(([type]) => type);
  }, [dimensionEstimates, totalWorkerEstimate]);

  const singleDimensionSum =
    dimensions.length === 1 ? (dimensionEstimates.get(dimensions[0]) ?? 0) : null;

  const unallocatedRemainder =
    totalWorkerEstimate != null && singleDimensionSum != null
      ? Math.max(0, totalWorkerEstimate - singleDimensionSum)
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  const showEmployerToggle =
    selectedEmployers.length > 0 && employers.length > 0;
  const showWorksiteToggle =
    !worksiteSectorWide &&
    selectedWorksites.length > 0 &&
    worksites.length > 0;

  // Build tree for rendering
  const topLevelUnits = units.filter((u) => !u.parent_draft_id);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CampaignUnitDraft[]>();
    for (const u of units) {
      if (!u.parent_draft_id) continue;
      const list = map.get(u.parent_draft_id) ?? [];
      list.push(u);
      map.set(u.parent_draft_id, list);
    }
    return map;
  }, [units]);

  // Existing group containers (for "add to existing" dropdown)
  const existingGroupContainersOfSelectedType = units.filter(
    (u) => u.is_group_container && u.ou_type === groupSelectedType
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign units</CardTitle>
        <CardDescription>
          Campaign units split your worker universe into the slices you organise
          around. Units of the same type form a dimension — each dimension covers
          your full worker population independently. Workers can belong to one
          group per type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* ── Build from scope ──────────────────────────────────────────── */}
        {(showEmployerToggle || showWorksiteToggle) && (
          <div className="space-y-3 rounded-md border bg-muted/40 p-4">
            <Label className="text-sm font-semibold">Build from scope</Label>
            {showEmployerToggle && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useEmployersAsUnits}
                  onChange={(e) => toggleEmployersAsUnits(e.target.checked)}
                />
                <span className="text-sm">
                  Use employers as campaign units —{" "}
                  <span className="text-muted-foreground">
                    creates one unit per selected employer ({employers.length}).
                  </span>
                </span>
              </label>
            )}
            {showWorksiteToggle && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={useWorksitesAsUnits}
                  onChange={(e) => toggleWorksitesAsUnits(e.target.checked)}
                />
                <span className="text-sm">
                  Use worksites as campaign units —{" "}
                  <span className="text-muted-foreground">
                    creates one unit per selected worksite ({worksites.length}).
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

        {/* ── Add a group of units ──────────────────────────────────────── */}
        <div className="space-y-3 rounded-md border p-4">
          <Label className="text-sm font-semibold">Add a group of units</Label>
          <p className="text-xs text-muted-foreground">
            Groups let you create multiple units of the same type together — e.g.
            three shift units in a shift group. Workers in a group can move between
            units within that group but not into units in a different group of the
            same type.
          </p>

          {/* Phase: idle — type selector */}
          {groupPhase === null && (
            <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Unit type</Label>
                <Select
                  value={groupSelectedType}
                  onValueChange={(v) => setGroupSelectedType(v as CampaignOuType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUPABLE_OU_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {OU_TYPE_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => startGroupCreation(groupSelectedType)}
              >
                <FolderOpen className="h-4 w-4 mr-1.5" />
                Set up group
              </Button>
            </div>
          )}

          {/* Phase: choose_action — existing groups present */}
          {groupPhase === "choose_action" && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                {OU_TYPE_LABELS[groupSelectedType]} groups already exist.
              </p>
              <p className="text-sm text-muted-foreground">
                Are you adding a unit to an existing group, or creating a new group?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupPhase("add_to_existing")}
                >
                  Add to existing group
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setGroupPhase("configure")}
                >
                  Create new group
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelGroupCreation}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Phase: configure — name + count */}
          {groupPhase === "configure" && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">
                Create a new {OU_TYPE_LABELS[groupSelectedType]?.toLowerCase()} group
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Group name</Label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={`e.g. ${groupSelectedType === "shift" ? "Offshore Shifts" : groupSelectedType === "department" ? "Maintenance Depts" : "Group name"}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">How many units in this group?</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setGroupMemberCount(Math.max(2, groupMemberCount - 1))}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center font-medium tabular-nums">
                      {groupMemberCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => setGroupMemberCount(Math.min(20, groupMemberCount + 1))}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={proceedToDefineMembers}
                  disabled={!groupName.trim()}
                >
                  Set up {groupMemberCount} units →
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelGroupCreation}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Phase: define_members — name + estimate each */}
          {groupPhase === "define_members" && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">
                Name each unit in &ldquo;{groupName}&rdquo;
              </p>
              <div className="space-y-2">
                {groupMembers.map((m, idx) => (
                  <div key={m.draft_member_id} className="grid grid-cols-[1fr_80px] gap-2 items-center">
                    <Input
                      value={m.name}
                      onChange={(e) => {
                        const next = [...groupMembers];
                        next[idx] = { ...m, name: e.target.value };
                        setGroupMembers(next);
                      }}
                      placeholder={`Unit ${idx + 1} name`}
                      className="text-sm"
                    />
                    <Input
                      type="number"
                      min={0}
                      className="text-sm"
                      value={m.estimate ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? null : Number(raw);
                        const next = [...groupMembers];
                        next[idx] = {
                          ...m,
                          estimate: n != null && !Number.isNaN(n) && n >= 0 ? n : null,
                        };
                        setGroupMembers(next);
                      }}
                      placeholder="Est."
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmGroup}
                  disabled={groupMembers.every((m) => !m.name.trim())}
                >
                  Confirm group
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupPhase("configure")}
                >
                  ← Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelGroupCreation}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Phase: add_to_existing — pick group, enter unit name */}
          {groupPhase === "add_to_existing" && (
            <div className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">
                Add a unit to an existing {OU_TYPE_LABELS[groupSelectedType]?.toLowerCase()} group
              </p>
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Select group</Label>
                  <Select value={groupTargetDraftId} onValueChange={setGroupTargetDraftId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a group…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingGroupContainersOfSelectedType.map((g) => (
                        <SelectItem key={g.draft_id} value={g.draft_id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid sm:grid-cols-[1fr_80px] gap-2 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">New unit name</Label>
                    <Input
                      value={addToGroupUnitName}
                      onChange={(e) => setAddToGroupUnitName(e.target.value)}
                      placeholder="e.g. Night Shift"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Est. workers</Label>
                    <Input
                      type="number"
                      min={0}
                      value={addToGroupUnitEstimate ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? null : Number(raw);
                        setAddToGroupUnitEstimate(
                          n != null && !Number.isNaN(n) && n >= 0 ? n : null
                        );
                      }}
                      placeholder="—"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmAddToExistingGroup}
                  disabled={!groupTargetDraftId || !addToGroupUnitName.trim()}
                >
                  Add unit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelGroupCreation}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Job type / occupation / custom single-unit add ────────────── */}
        <div className="space-y-3 rounded-md border p-4">
          <Label className="text-sm font-semibold">Add a single unit</Label>
          <div className="grid sm:grid-cols-[170px_1fr_auto] gap-2 items-start">
            <Select
              value={pendingKind}
              onValueChange={(v) => {
                setPendingKind(v as "occupation_group" | "occupation" | "custom");
                setPendingPick("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="occupation_group">Occupational grouping</SelectItem>
                <SelectItem value="occupation">Occupation</SelectItem>
                <SelectItem value="custom">Custom unit</SelectItem>
              </SelectContent>
            </Select>

            {pendingKind === "custom" ? (
              <Input
                value={pendingCustomName}
                onChange={(e) => setPendingCustomName(e.target.value)}
                placeholder="e.g. Day shift, Drilling crew, Catering…"
              />
            ) : pendingKind === "occupation_group" ? (
              <Select value={pendingPick} onValueChange={setPendingPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an occupational grouping…" />
                </SelectTrigger>
                <SelectContent>
                  {occupationGroups.map((g) => (
                    <SelectItem key={g.group_id} value={String(g.group_id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={pendingPick} onValueChange={setPendingPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an occupation…" />
                </SelectTrigger>
                <SelectContent>
                  {occupations.map((o) => (
                    <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                      {o.canonical_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={addPendingUnit}
              disabled={
                pendingKind === "custom"
                  ? !pendingCustomName.trim()
                  : !pendingPick
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* ── Unit list ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Label className="text-sm font-semibold">
              Units ({units.filter((u) => !u.is_group_container).length} across{" "}
              {topLevelUnits.length} top-level entries)
            </Label>
            {totalWorkerEstimate != null && dimensionEstimates.size > 0 && (
              <div className="text-xs text-muted-foreground text-right space-y-0.5">
                {dimensions.length === 1 ? (
                  <p>
                    Estimate sum:{" "}
                    <strong>{singleDimensionSum ?? 0}</strong> /{" "}
                    {totalWorkerEstimate}
                    {unallocatedRemainder != null && (
                      <>
                        {" · "}Unallocated remainder:{" "}
                        <strong>{unallocatedRemainder}</strong>
                      </>
                    )}
                  </p>
                ) : (
                  Array.from(dimensionEstimates.entries()).map(([type, sum]) => (
                    <p key={type}>
                      {OU_TYPE_LABELS[type] ?? type} units:{" "}
                      <strong>{sum}</strong> / {totalWorkerEstimate}
                      {" · "}rem.{" "}
                      <strong>{Math.max(0, totalWorkerEstimate - sum)}</strong>
                    </p>
                  ))
                )}
              </div>
            )}
          </div>

          {units.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No units yet. Use the toggles above, or add a group / single unit.
            </div>
          )}

          {topLevelUnits.map((parent) => {
            const children = childrenByParent.get(parent.draft_id) ?? [];
            const isGroupContainer = parent.is_group_container === true;

            if (isGroupContainer) {
              return (
                <GroupContainerRow
                  key={parent.draft_id}
                  container={parent}
                  members={children}
                  campaignId={campaignId}
                  campaignWorkers={campaignWorkers}
                  pendingGroupAllocations={pendingGroupAllocations}
                  setPendingGroupAllocations={setPendingGroupAllocations}
                  onUpdate={updateUnit}
                  onRemove={removeUnit}
                />
              );
            }

            // Regular unit (standalone or legacy sub-unit)
            return (
              <div key={parent.draft_id} className="space-y-2">
                <UnitRow
                  unit={parent}
                  isSubUnit={false}
                  onUpdate={updateUnit}
                  onRemove={removeUnit}
                  onAddSubUnit={addSubUnit}
                  showSubUnitButton
                />
                {children.length > 0 && (
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    {children.map((c) => (
                      <UnitRow
                        key={c.draft_id}
                        unit={c}
                        isSubUnit
                        onUpdate={updateUnit}
                        onRemove={removeUnit}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Synthetic unallocated row (single-dimension only) */}
          {totalWorkerEstimate != null && dimensions.length <= 1 && (
            <div className="flex items-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/20 bg-muted/30 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Unallocated</p>
                <p className="text-xs text-muted-foreground">
                  Workers on this campaign not placed into a specific unit show
                  up here automatically.
                </p>
              </div>
              <div className="text-sm tabular-nums">
                est. {unallocatedRemainder ?? 0}
              </div>
            </div>
          )}
        </div>

        {/* ── Estimate warnings ─────────────────────────────────────────── */}
        {overDimensions.length > 0 && (
          <div className="space-y-2">
            {overDimensions.map((type) => {
              const sum = dimensionEstimates.get(type) ?? 0;
              return (
                <div
                  key={type}
                  className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Your{" "}
                    <strong>{OU_TYPE_LABELS[type] ?? type}</strong> unit estimates
                    total {sum}, which is {sum - (totalWorkerEstimate ?? 0)}{" "}
                    above the campaign estimate ({totalWorkerEstimate}). Adjust
                    the individual unit estimates to match.
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {showBackButton && (
            <Button variant="ghost" onClick={onBack} disabled={isPending}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            onClick={onContinue}
            disabled={isPending}
            className={showBackButton ? undefined : "ml-auto"}
          >
            {isPending ? "Saving…" : (continueLabel ?? "Continue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UnitRow({
  unit,
  isSubUnit,
  onUpdate,
  onRemove,
  onAddSubUnit,
  showSubUnitButton = false,
}: {
  unit: CampaignUnitDraft;
  isSubUnit: boolean;
  onUpdate: (draftId: string, partial: Partial<CampaignUnitDraft>) => void;
  onRemove: (draftId: string) => void;
  onAddSubUnit?: (parentDraftId: string) => void;
  showSubUnitButton?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border p-3 ${
        isSubUnit ? "border-l-4 border-l-primary/40 bg-muted/20" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <Input
          value={unit.name}
          onChange={(e) => onUpdate(unit.draft_id, { name: e.target.value })}
          className="text-sm font-medium"
        />
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            {unit.ou_type}
          </Badge>
          {isSubUnit && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1 gap-1">
              <Layers className="h-3 w-3" />
              sub-unit
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          type="number"
          min={0}
          className="w-20 text-sm"
          value={unit.total_workers_estimated ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            const n = raw === "" ? null : Number(raw);
            onUpdate(unit.draft_id, {
              total_workers_estimated:
                n != null && !Number.isNaN(n) && n >= 0 ? n : null,
            });
          }}
          placeholder="—"
        />
        <span className="text-xs text-muted-foreground">est.</span>
        {showSubUnitButton && onAddSubUnit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs gap-1"
            onClick={() => onAddSubUnit(unit.draft_id)}
            title="Add a sub-unit beneath this unit"
          >
            <Plus className="h-3.5 w-3.5" />
            Sub
          </Button>
        )}
        <button
          type="button"
          onClick={() => onRemove(unit.draft_id)}
          className="text-muted-foreground hover:text-foreground"
          title="Remove unit"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Renders a group container with its member units and an optional inline
 * worker allocation panel. The allocation panel is shown when the campaign
 * has at least one worker in scope. For draft groups (members without ou_id
 * yet), allocations are stored keyed by draft_id and resolved to real ou_ids
 * by saveUnitsMutation in the parent wizard.
 */
function GroupContainerRow({
  container,
  members,
  campaignId,
  campaignWorkers,
  pendingGroupAllocations,
  setPendingGroupAllocations,
  onUpdate,
  onRemove,
}: {
  container: CampaignUnitDraft;
  members: CampaignUnitDraft[];
  campaignId: number | null;
  campaignWorkers: WorkerRow[];
  pendingGroupAllocations: PendingGroupAllocations;
  setPendingGroupAllocations: (next: PendingGroupAllocations) => void;
  onUpdate: (draftId: string, partial: Partial<CampaignUnitDraft>) => void;
  onRemove: (draftId: string) => void;
}) {
  const [allocationOpen, setAllocationOpen] = useState(false);

  // Count of workers allocated across all members of this group
  const allocatedCount = useMemo(() => {
    const workerSet = new Set<number>();
    for (const m of members) {
      const set = pendingGroupAllocations[m.draft_id];
      if (set) for (const wid of set) workerSet.add(wid);
    }
    return workerSet.size;
  }, [members, pendingGroupAllocations]);

  return (
    <div className="rounded-md border border-primary/30 overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 bg-primary/5 px-3 py-2">
        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
        <Input
          value={container.name}
          onChange={(e) => onUpdate(container.draft_id, { name: e.target.value })}
          className="h-7 text-sm font-semibold bg-transparent border-0 shadow-none px-0 focus-visible:ring-0"
        />
        <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
          {OU_TYPE_LABELS[container.ou_type] ?? container.ou_type} group
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
          {members.length} units
        </Badge>
        {allocatedCount > 0 && (
          <Badge className="text-[10px] h-4 px-1 shrink-0 bg-green-100 text-green-800 border-green-200">
            <Users className="h-2.5 w-2.5 mr-0.5" />
            {allocatedCount} allocated
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          {campaignWorkers.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => setAllocationOpen((o) => !o)}
              title="Allocate workers to units in this group"
            >
              <Users className="h-3 w-3" />
              {allocationOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          )}
          <button
            type="button"
            onClick={() => onRemove(container.draft_id)}
            className="text-muted-foreground hover:text-foreground"
            title="Remove group and all its units"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Group members */}
      <div className="divide-y">
        {members.map((m) => (
          <div key={m.draft_id} className="flex items-center gap-2 px-3 py-2 pl-8">
            <div className="flex-1 min-w-0">
              <Input
                value={m.name}
                onChange={(e) => onUpdate(m.draft_id, { name: e.target.value })}
                className="h-7 text-sm bg-transparent border-0 shadow-none px-0 focus-visible:ring-0"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Input
                type="number"
                min={0}
                className="w-16 h-7 text-xs"
                value={m.total_workers_estimated ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? null : Number(raw);
                  onUpdate(m.draft_id, {
                    total_workers_estimated:
                      n != null && !Number.isNaN(n) && n >= 0 ? n : null,
                  });
                }}
                placeholder="est."
              />
              {/* Show allocation count badge for this member */}
              {(pendingGroupAllocations[m.draft_id]?.size ?? 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {pendingGroupAllocations[m.draft_id].size}w
                </Badge>
              )}
              <button
                type="button"
                onClick={() => onRemove(m.draft_id)}
                className="text-muted-foreground hover:text-foreground"
                title="Remove this unit from the group"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="px-8 py-2 text-xs text-muted-foreground">
            No member units. Remove this group or add units via &ldquo;Add to existing group&rdquo;.
          </p>
        )}
      </div>

      {/* Inline allocation panel */}
      {allocationOpen && campaignWorkers.length > 0 && (
        <GroupAllocationPanel
          members={members}
          campaignWorkers={campaignWorkers}
          pendingGroupAllocations={pendingGroupAllocations}
          setPendingGroupAllocations={setPendingGroupAllocations}
        />
      )}
    </div>
  );
}

/**
 * Inline worker allocation panel for a group. Workers are multi-selected and
 * bulk-assigned to a member unit within the group. Allocations are stored in
 * pendingGroupAllocations keyed by member draft_id, not by real ou_id, because
 * group members may not yet have been saved. The wizard resolves draft_ids to
 * ou_ids in saveUnitsMutation.onSuccess.
 */
function GroupAllocationPanel({
  members,
  campaignWorkers,
  pendingGroupAllocations,
  setPendingGroupAllocations,
}: {
  members: CampaignUnitDraft[];
  campaignWorkers: WorkerRow[];
  pendingGroupAllocations: PendingGroupAllocations;
  setPendingGroupAllocations: (next: PendingGroupAllocations) => void;
}) {
  const [search, setSearch] = useState("");
  const [pageSelection, setPageSelection] = useState<Set<number>>(new Set());
  const [bulkMemberDraftId, setBulkMemberDraftId] = useState<string>("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return campaignWorkers;
    return campaignWorkers.filter((w) =>
      `${w.first_name} ${w.last_name}`.toLowerCase().includes(term)
    );
  }, [campaignWorkers, search]);

  // Set of all worker_ids already allocated to any member in this group
  const allocatedWorkerIds = useMemo(() => {
    const s = new Set<number>();
    for (const m of members) {
      const set = pendingGroupAllocations[m.draft_id];
      if (set) for (const wid of set) s.add(wid);
    }
    return s;
  }, [members, pendingGroupAllocations]);

  function getWorkerUnit(workerId: number): string | null {
    for (const m of members) {
      if (pendingGroupAllocations[m.draft_id]?.has(workerId)) return m.draft_id;
    }
    return null;
  }

  function allocateWorkerToUnit(workerId: number, memberDraftId: string) {
    const next = { ...pendingGroupAllocations };
    // Remove from any other member in this group first
    for (const m of members) {
      if (next[m.draft_id]) {
        const s = new Set(next[m.draft_id]);
        s.delete(workerId);
        if (s.size === 0) delete next[m.draft_id];
        else next[m.draft_id] = s;
      }
    }
    if (memberDraftId !== "__unallocate__") {
      const s = new Set(next[memberDraftId] ?? new Set<number>());
      s.add(workerId);
      next[memberDraftId] = s;
    }
    setPendingGroupAllocations(next);
  }

  function bulkAllocate() {
    if (pageSelection.size === 0 || !bulkMemberDraftId) return;
    let next = { ...pendingGroupAllocations };
    for (const workerId of pageSelection) {
      // Remove from any other member in this group
      for (const m of members) {
        if (next[m.draft_id]) {
          const s = new Set(next[m.draft_id]);
          s.delete(workerId);
          if (s.size === 0) delete next[m.draft_id];
          else next[m.draft_id] = s;
        }
      }
      if (bulkMemberDraftId !== "__unallocate__") {
        const s = new Set(next[bulkMemberDraftId] ?? new Set<number>());
        s.add(workerId);
        next[bulkMemberDraftId] = s;
      }
    }
    setPendingGroupAllocations(next);
    setPageSelection(new Set());
  }

  return (
    <div className="border-t bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        Allocate workers to units in this group
      </p>

      {/* Bulk allocation bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:underline"
          onClick={() => setPageSelection(new Set(filtered.map((w) => w.worker_id)))}
        >
          <CheckSquare className="h-3 w-3" />
          Select all ({filtered.length})
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:underline"
          onClick={() => setPageSelection(new Set())}
        >
          <Square className="h-3 w-3" />
          Clear ({pageSelection.size})
        </button>
        <span className="text-muted-foreground">·</span>
        <Select value={bulkMemberDraftId} onValueChange={setBulkMemberDraftId}>
          <SelectTrigger className="h-7 w-auto text-xs">
            <SelectValue placeholder="Assign to unit…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unallocate__">Remove from group</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.draft_id} value={m.draft_id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={bulkAllocate}
          disabled={pageSelection.size === 0 || !bulkMemberDraftId}
        >
          Allocate selection
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search workers…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-7 text-xs"
      />

      {/* Worker list */}
      <div className="max-h-64 overflow-auto rounded-md border text-xs">
        <table className="w-full">
          <thead className="sticky top-0 bg-muted/80">
            <tr className="border-b">
              <th className="w-6 p-1.5"></th>
              <th className="text-left p-1.5 font-medium">Name</th>
              <th className="text-left p-1.5 font-medium">Employer</th>
              <th className="text-left p-1.5 font-medium">Assigned unit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const currentUnitDraftId = getWorkerUnit(w.worker_id);
              const currentUnitName = currentUnitDraftId
                ? members.find((m) => m.draft_id === currentUnitDraftId)?.name
                : null;
              return (
                <tr key={w.worker_id} className="border-b hover:bg-muted/30">
                  <td className="p-1.5">
                    <input
                      type="checkbox"
                      checked={pageSelection.has(w.worker_id)}
                      onChange={(e) => {
                        const next = new Set(pageSelection);
                        if (e.target.checked) next.add(w.worker_id);
                        else next.delete(w.worker_id);
                        setPageSelection(next);
                      }}
                    />
                  </td>
                  <td className="p-1.5 whitespace-nowrap">
                    {w.last_name}, {w.first_name}
                  </td>
                  <td className="p-1.5 truncate max-w-[120px] text-muted-foreground">
                    {w.employer_name ?? "—"}
                  </td>
                  <td className="p-1.5">
                    {currentUnitName ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-primary font-medium">
                          {currentUnitName}
                        </span>
                        <button
                          type="button"
                          title="Remove from group"
                          onClick={() =>
                            allocateWorkerToUnit(w.worker_id, "__unallocate__")
                          }
                        >
                          <X className="h-2.5 w-2.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </span>
                    ) : (
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (!v) return;
                          allocateWorkerToUnit(w.worker_id, v);
                        }}
                      >
                        <SelectTrigger className="h-5 w-auto px-1.5 text-[10px] rounded-full border-dashed border-muted-foreground/40 gap-0 [&>svg]:hidden">
                          <span className="text-muted-foreground">+ assign</span>
                        </SelectTrigger>
                        <SelectContent>
                          {members.map((m) => (
                            <SelectItem
                              key={m.draft_id}
                              value={m.draft_id}
                              className="text-xs"
                            >
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-3 text-center text-muted-foreground">
                  No workers match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {allocatedWorkerIds.size} worker{allocatedWorkerIds.size !== 1 ? "s" : ""}{" "}
        allocated across this group · allocations are saved when you click Continue.
      </p>
    </div>
  );
}
