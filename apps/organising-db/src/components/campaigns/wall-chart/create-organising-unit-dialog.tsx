"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Layers } from "lucide-react";
import type { CampaignOuType } from "@/types/database";
import { useAuth } from "@/lib/supabase/auth-context";

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

// Types where creating a named group of multiple units is the natural workflow.
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
type GroupPhase =
  | "choose_action"   // type has existing groups → ask add-to-existing vs create-new
  | "configure"       // enter group name + count
  | "define_members"  // name + estimate each member
  | "add_to_existing"; // add one unit to an existing group

interface ExistingOu {
  ou_id: number;
  ou_type: CampaignOuType;
  name: string;
  is_group_container: boolean;
  ou_group_id: number | null;
  parent_ou_id: number | null;
}

interface MemberEntry {
  key: string;
  name: string;
  estimate: string;
}

export function CreateOrganisingUnitDialog({
  open,
  onOpenChange,
  campaignId,
  displayOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  displayOrder: number;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ── Mode selection ─────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("single");

  // ── Single-unit state ──────────────────────────────────────────────────────
  const [singleName, setSingleName] = useState("");
  const [singleType, setSingleType] = useState<CampaignOuType>("shift");
  const [singleEstimate, setSingleEstimate] = useState("");

  // ── Group-creation state ───────────────────────────────────────────────────
  const [groupPhase, setGroupPhase] = useState<GroupPhase>("configure");
  const [groupType, setGroupType] = useState<CampaignOuType>("shift");
  const [groupName, setGroupName] = useState("");
  const [groupMemberCount, setGroupMemberCount] = useState(3);
  const [groupMembers, setGroupMembers] = useState<MemberEntry[]>([]);
  // For "add to existing" path
  const [existingGroupId, setExistingGroupId] = useState<string>("");
  const [addUnitName, setAddUnitName] = useState("");
  const [addUnitEstimate, setAddUnitEstimate] = useState("");

  // ── Existing OUs for the campaign (for group context) ──────────────────────
  const { data: existingOus = [] } = useQuery<ExistingOu[]>({
    queryKey: ["campaign-ous-for-create-dialog", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, ou_type, name, is_group_container, ou_group_id, parent_ou_id")
        .eq("campaign_id", Number(campaignId))
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExistingOu[];
    },
    enabled: !!user && open,
  });

  // Group containers for the currently selected group type
  const groupContainersOfType = useMemo(
    () =>
      existingOus.filter(
        (o) => o.is_group_container && o.ou_type === groupType
      ),
    [existingOus, groupType]
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["campaign-ous-for-create-dialog", campaignId] });
  };

  const createSingleOu = useAuthAwareMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        name: singleName.trim(),
        ou_type: singleType,
        display_order: displayOrder,
        source: "manual",
        is_group_container: false,
      };
      if (singleEstimate.trim()) {
        const n = Number(singleEstimate);
        if (!Number.isNaN(n) && n >= 0) payload.total_workers_estimated = n;
      }
      const { error } = await supabase
        .from("campaign_organising_units")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      handleClose();
    },
  });

  const createGroup = useAuthAwareMutation({
    mutationFn: async () => {
      if (!groupName.trim() || groupMembers.length === 0) return;

      // 1. Insert the group container
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

      // 2. Insert member units
      const memberRows = groupMembers
        .filter((m) => m.name.trim())
        .map((m, i) => {
          const row: Record<string, unknown> = {
            campaign_id: Number(campaignId),
            name: m.name.trim(),
            ou_type: groupType,
            display_order: displayOrder + 1 + i,
            source: "manual",
            is_group_container: false,
            parent_ou_id: containerOuId,
            ou_group_id: containerOuId,
            unit_basis: { custom: true },
          };
          if (m.estimate.trim()) {
            const n = Number(m.estimate);
            if (!Number.isNaN(n) && n >= 0) row.total_workers_estimated = n;
          }
          return row;
        });

      if (memberRows.length > 0) {
        const { error: memberErr } = await supabase
          .from("campaign_organising_units")
          .insert(memberRows);
        if (memberErr) throw memberErr;
      }
    },
    onSuccess: () => {
      invalidate();
      handleClose();
    },
  });

  const addToExistingGroup = useAuthAwareMutation({
    mutationFn: async () => {
      const containerOuId = Number(existingGroupId);
      if (!containerOuId || !addUnitName.trim()) return;
      const container = existingOus.find((o) => o.ou_id === containerOuId);
      if (!container) return;

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
      if (addUnitEstimate.trim()) {
        const n = Number(addUnitEstimate);
        if (!Number.isNaN(n) && n >= 0) payload.total_workers_estimated = n;
      }
      const { error } = await supabase
        .from("campaign_organising_units")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      handleClose();
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleClose() {
    onOpenChange(false);
    // Reset all state
    setMode("single");
    setSingleName("");
    setSingleType("shift");
    setSingleEstimate("");
    resetGroupState();
  }

  function resetGroupState() {
    setGroupPhase("configure");
    setGroupName("");
    setGroupMemberCount(3);
    setGroupMembers([]);
    setExistingGroupId("");
    setAddUnitName("");
    setAddUnitEstimate("");
  }

  function handleGroupTypeChange(type: CampaignOuType) {
    setGroupType(type);
    const hasGroups = existingOus.some(
      (o) => o.is_group_container && o.ou_type === type
    );
    setGroupPhase(hasGroups ? "choose_action" : "configure");
    setGroupName("");
    setGroupMembers([]);
    setExistingGroupId("");
  }

  function proceedToDefineMembers() {
    const count = Math.max(2, Math.min(20, groupMemberCount));
    const label = OU_TYPE_LABELS[groupType] ?? groupType;
    setGroupMembers(
      Array.from({ length: count }, (_, i) => ({
        key: `m${i}`,
        name: `${label} ${i + 1}`,
        estimate: "",
      }))
    );
    setGroupPhase("define_members");
  }

  const isPending =
    createSingleOu.isPending ||
    createGroup.isPending ||
    addToExistingGroup.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New organising unit</DialogTitle>
          <DialogDescription>
            Create a single unit or a named group of units of the same type.
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
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

        {/* ── Single unit form ──────────────────────────────────────────── */}
        {mode === "single" && (
          <div className="grid gap-4 py-1">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="e.g. Day Shift"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={singleType}
                onValueChange={(v) => setSingleType(v as CampaignOuType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OU_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {OU_TYPE_LABELS[t] ?? t}
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
                onChange={(e) => setSingleEstimate(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
          </div>
        )}

        {/* ── Group flow ─────────────────────────────────────────────────── */}
        {mode === "group" && (
          <div className="space-y-4 py-1">
            {/* Type selector (always visible in group mode) */}
            <div className="space-y-2">
              <Label>Unit type</Label>
              <Select
                value={groupType}
                onValueChange={(v) => handleGroupTypeChange(v as CampaignOuType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPABLE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {OU_TYPE_LABELS[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Phase: choose_action */}
            {groupPhase === "choose_action" && (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                <p className="text-sm font-medium">
                  {OU_TYPE_LABELS[groupType]} groups already exist.
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
                </div>
              </div>
            )}

            {/* Phase: configure */}
            {groupPhase === "configure" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Group name</Label>
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={
                      groupType === "shift"
                        ? "e.g. Offshore Shifts"
                        : groupType === "department"
                        ? "e.g. Maintenance Depts"
                        : "Group name"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Workers in this group can move between units within it but not into
                    units in a different group of the same type.
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
                      onClick={() =>
                        setGroupMemberCount((n) => Math.max(2, n - 1))
                      }
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
                      onClick={() =>
                        setGroupMemberCount((n) => Math.min(20, n + 1))
                      }
                    >
                      +
                    </Button>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={proceedToDefineMembers}
                  disabled={!groupName.trim()}
                >
                  Set up {groupMemberCount} units →
                </Button>
              </div>
            )}

            {/* Phase: define_members */}
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
                  {groupMembers.map((m, idx) => (
                    <div
                      key={m.key}
                      className="grid grid-cols-[1fr_72px] gap-2 items-center"
                    >
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
                        value={m.estimate}
                        onChange={(e) => {
                          const next = [...groupMembers];
                          next[idx] = { ...m, estimate: e.target.value };
                          setGroupMembers(next);
                        }}
                        placeholder="Est."
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGroupPhase("configure")}
                >
                  ← Back
                </Button>
              </div>
            )}

            {/* Phase: add_to_existing */}
            {groupPhase === "add_to_existing" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Select group</Label>
                  <Select
                    value={existingGroupId}
                    onValueChange={setExistingGroupId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a group…" />
                    </SelectTrigger>
                    <SelectContent>
                      {groupContainersOfType.map((g) => (
                        <SelectItem key={g.ou_id} value={String(g.ou_id)}>
                          {g.name}
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
                      onChange={(e) => setAddUnitName(e.target.value)}
                      placeholder={`e.g. ${groupType === "shift" ? "Night Shift" : "New unit"}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Est.</Label>
                    <Input
                      type="number"
                      min={0}
                      value={addUnitEstimate}
                      onChange={(e) => setAddUnitEstimate(e.target.value)}
                      placeholder="—"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGroupPhase("choose_action")}
                >
                  ← Back
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>

          {mode === "single" && (
            <Button
              type="button"
              disabled={!singleName.trim() || isPending}
              onClick={() => createSingleOu.mutate()}
            >
              {createSingleOu.isPending ? "Creating…" : "Create unit"}
            </Button>
          )}

          {mode === "group" && groupPhase === "define_members" && (
            <Button
              type="button"
              disabled={
                groupMembers.every((m) => !m.name.trim()) || isPending
              }
              onClick={() => createGroup.mutate()}
            >
              {createGroup.isPending
                ? "Creating…"
                : `Create group (${groupMembers.filter((m) => m.name.trim()).length} units)`}
            </Button>
          )}

          {mode === "group" && groupPhase === "add_to_existing" && (
            <Button
              type="button"
              disabled={!existingGroupId || !addUnitName.trim() || isPending}
              onClick={() => addToExistingGroup.mutate()}
            >
              {addToExistingGroup.isPending ? "Adding…" : "Add unit to group"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
