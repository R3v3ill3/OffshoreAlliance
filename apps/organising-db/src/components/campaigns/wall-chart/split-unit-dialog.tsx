"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowRight, ArrowLeft, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import type {
  CampaignOuSplitDimension,
  CampaignOuType,
  CampaignOuUnitBasis,
  SplitOuRpcResultRow,
  WorkerRosterPanelOption,
  WorkerShiftOption,
  WorkerWorkAreaOption,
} from "@/types/database";
import { humanizeOuType, ouDisplayName, type WallChartOU } from "./types";

// ── Types ────────────────────────────────────────────────────────────────────

export type SplitUnitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | number;
  /** The parent unit being split. */
  parent: WallChartOU;
  /** Workers currently assigned to the parent unit. Used to seed sub-unit suggestions. */
  members: SplitMember[];
  onSplit?: (result: { createdOuIds: number[]; assignedWorkers: number }) => void;
};

export type SplitMember = {
  worker_id: number;
  first_name: string;
  last_name: string;
  canonical_occupation_id: number | null;
  canonical_occupation_name: string | null;
  shift_id: number | null;
  work_area_id: number | null;
  roster_panel_id: number | null;
  /** Tag names attached to the worker (lower-cased). */
  tag_names: string[];
};

type WizardStep = "dimension" | "drafts" | "assign" | "review";

type SubUnitDraft = {
  draft_id: string;
  name: string;
  ou_type: CampaignOuType;
  unit_basis: CampaignOuUnitBasis;
  /** Worker ids tentatively assigned to this draft. */
  member_ids: Set<number>;
};

type LeaderLinkRow = {
  follower_worker_id: number;
  leader_worker_id: number;
  leader: { first_name: string; last_name: string } | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const DIMENSION_TO_OU_TYPE: Record<CampaignOuSplitDimension, CampaignOuType> = {
  occupation: "job_type",
  shift: "shift",
  work_area: "work_area",
  roster_panel: "crew_rotation",
  tag: "custom",
  activist: "network",
  custom: "custom",
};

function newDraftId(): string {
  return `sub_${Math.random().toString(36).slice(2, 10)}`;
}

function workerLabel(m: SplitMember): string {
  return `${m.last_name}, ${m.first_name}`.trim();
}

// ── Component ────────────────────────────────────────────────────────────────

export function SplitUnitDialog({
  open,
  onOpenChange,
  campaignId,
  parent,
  members,
  onSplit,
}: SplitUnitDialogProps) {
  const supabase = createClient();
  const qc = useQueryClient();

  const [step, setStep] = useState<WizardStep>("dimension");
  const [dimension, setDimension] = useState<CampaignOuSplitDimension | null>(null);
  const [drafts, setDrafts] = useState<SubUnitDraft[]>([]);
  const [keepInParent, setKeepInParent] = useState(true);
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset wizard when dialog opens / parent changes.
  useEffect(() => {
    if (!open) return;
    setStep("dimension");
    setDimension(null);
    setDrafts([]);
    setKeepInParent(true);
    setActiveDraftIndex(0);
    setSearchQuery("");
    setErrorMessage(null);
  }, [open, parent.ou_id]);

  // ── Reference data for dimension options ────────────────────────────────
  const memberShiftIds = useMemo(
    () => [...new Set(members.map((m) => m.shift_id).filter((v): v is number => v != null))],
    [members]
  );
  const memberWorkAreaIds = useMemo(
    () => [...new Set(members.map((m) => m.work_area_id).filter((v): v is number => v != null))],
    [members]
  );
  const memberRosterIds = useMemo(
    () =>
      [...new Set(members.map((m) => m.roster_panel_id).filter((v): v is number => v != null))],
    [members]
  );
  const memberWorkerIds = useMemo(() => members.map((m) => m.worker_id), [members]);

  const shiftQuery = useQuery({
    queryKey: ["worker-shift-options", memberShiftIds],
    queryFn: async (): Promise<WorkerShiftOption[]> => {
      if (memberShiftIds.length === 0) return [];
      const { data, error } = await supabase
        .from("worker_shift_options")
        .select("id, name, employer_id, worksite_id, is_active, sort_order, created_at, updated_at")
        .in("id", memberShiftIds);
      if (error) throw error;
      return (data ?? []) as WorkerShiftOption[];
    },
    enabled: open && memberShiftIds.length > 0,
  });

  const workAreaQuery = useQuery({
    queryKey: ["worker-work-area-options", memberWorkAreaIds],
    queryFn: async (): Promise<WorkerWorkAreaOption[]> => {
      if (memberWorkAreaIds.length === 0) return [];
      const { data, error } = await supabase
        .from("worker_work_area_options")
        .select("id, name, employer_id, worksite_id, is_active, sort_order, created_at, updated_at")
        .in("id", memberWorkAreaIds);
      if (error) throw error;
      return (data ?? []) as WorkerWorkAreaOption[];
    },
    enabled: open && memberWorkAreaIds.length > 0,
  });

  const rosterQuery = useQuery({
    queryKey: ["worker-roster-panel-options", memberRosterIds],
    queryFn: async (): Promise<WorkerRosterPanelOption[]> => {
      if (memberRosterIds.length === 0) return [];
      const { data, error } = await supabase
        .from("worker_roster_panel_options")
        .select("id, name, employer_id, worksite_id, is_active, sort_order, created_at, updated_at")
        .in("id", memberRosterIds);
      if (error) throw error;
      return (data ?? []) as WorkerRosterPanelOption[];
    },
    enabled: open && memberRosterIds.length > 0,
  });

  // Leader links — pull all (leader, follower) pairs that involve any current member.
  // We use the leader as the grouping key.
  const leaderLinksQuery = useQuery({
    queryKey: ["split-unit-leader-links", String(campaignId), memberWorkerIds],
    queryFn: async (): Promise<LeaderLinkRow[]> => {
      if (memberWorkerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select(
          `follower_worker_id, leader_worker_id,
           leader:workers!campaign_leader_worker_links_leader_worker_id_fkey(first_name, last_name)`
        )
        .eq("campaign_id", Number(campaignId))
        .in("follower_worker_id", memberWorkerIds);
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        const leaderRel = row.leader;
        const leader = (Array.isArray(leaderRel) ? leaderRel[0] : leaderRel) as
          | { first_name: string; last_name: string }
          | null;
        return {
          follower_worker_id: row.follower_worker_id as number,
          leader_worker_id: row.leader_worker_id as number,
          leader: leader ?? null,
        };
      });
    },
    enabled: open && memberWorkerIds.length > 0,
  });

  // ── Available dimensions (only show those with data) ───────────────────
  const availableDimensions = useMemo(() => {
    const out: { dimension: CampaignOuSplitDimension; label: string; sample: number }[] = [];
    const occCount = new Set(
      members.map((m) => m.canonical_occupation_id).filter((v) => v != null)
    ).size;
    out.push({ dimension: "occupation", label: "Occupation", sample: occCount });

    const shiftCount = new Set(members.map((m) => m.shift_id).filter((v) => v != null)).size;
    out.push({ dimension: "shift", label: "Shift", sample: shiftCount });

    const waCount = new Set(members.map((m) => m.work_area_id).filter((v) => v != null)).size;
    out.push({ dimension: "work_area", label: "Work area", sample: waCount });

    const rosterCount = new Set(
      members.map((m) => m.roster_panel_id).filter((v) => v != null)
    ).size;
    out.push({ dimension: "roster_panel", label: "Roster / Panel", sample: rosterCount });

    const tagCount = new Set(members.flatMap((m) => m.tag_names)).size;
    out.push({ dimension: "tag", label: "Tag", sample: tagCount });

    // Activist split: how many distinct leaders the parent's members are
    // currently linked to via "Link to leader". 0 means no follower links
    // exist yet — the dimension is still selectable (helpful nudge to add
    // links first), but the dimension picker reflects that no sub-units
    // can be auto-suggested.
    const activistCount = new Set(
      (leaderLinksQuery.data ?? []).map((l) => l.leader_worker_id)
    ).size;
    out.push({
      dimension: "activist",
      label: "Activist connection (link to leader)",
      sample: activistCount,
    });
    out.push({ dimension: "custom", label: "Custom (define your own)", sample: 0 });
    return out;
  }, [members, leaderLinksQuery.data]);

  // ── Suggestion seed when dimension is picked ───────────────────────────
  function seedDraftsFromDimension(dim: CampaignOuSplitDimension): SubUnitDraft[] {
    const ouType = DIMENSION_TO_OU_TYPE[dim];
    const baseUnitBasis = (
      patch: Partial<CampaignOuUnitBasis>
    ): CampaignOuUnitBasis => ({
      parent_ou_id: parent.ou_id,
      dimension: dim,
      ...patch,
    });

    if (dim === "occupation") {
      const groups = new Map<number, { name: string; member_ids: Set<number> }>();
      for (const m of members) {
        if (m.canonical_occupation_id == null) continue;
        const id = m.canonical_occupation_id;
        if (!groups.has(id)) {
          groups.set(id, {
            name: m.canonical_occupation_name ?? `Occupation #${id}`,
            member_ids: new Set(),
          });
        }
        groups.get(id)!.member_ids.add(m.worker_id);
      }
      return [...groups.entries()].map(([id, g]) => ({
        draft_id: newDraftId(),
        name: g.name,
        ou_type: ouType,
        unit_basis: baseUnitBasis({ canonical_occupation_id: id, value: id }),
        member_ids: g.member_ids,
      }));
    }

    if (dim === "shift" || dim === "work_area" || dim === "roster_panel") {
      const idAccessor: (m: SplitMember) => number | null =
        dim === "shift"
          ? (m) => m.shift_id
          : dim === "work_area"
            ? (m) => m.work_area_id
            : (m) => m.roster_panel_id;
      const optionMap = new Map<number, string>();
      const lookups =
        dim === "shift"
          ? (shiftQuery.data ?? [])
          : dim === "work_area"
            ? (workAreaQuery.data ?? [])
            : (rosterQuery.data ?? []);
      for (const opt of lookups) optionMap.set(opt.id, opt.name);

      const groups = new Map<number, { name: string; member_ids: Set<number> }>();
      for (const m of members) {
        const id = idAccessor(m);
        if (id == null) continue;
        if (!groups.has(id)) {
          groups.set(id, { name: optionMap.get(id) ?? `#${id}`, member_ids: new Set() });
        }
        groups.get(id)!.member_ids.add(m.worker_id);
      }
      const basisKey =
        dim === "shift"
          ? "shift_id"
          : dim === "work_area"
            ? "work_area_id"
            : "roster_panel_id";
      return [...groups.entries()].map(([id, g]) => ({
        draft_id: newDraftId(),
        name: g.name,
        ou_type: ouType,
        unit_basis: baseUnitBasis({ [basisKey]: id, value: id }),
        member_ids: g.member_ids,
      }));
    }

    if (dim === "tag") {
      const groups = new Map<string, Set<number>>();
      for (const m of members) {
        for (const tag of m.tag_names) {
          if (!groups.has(tag)) groups.set(tag, new Set());
          groups.get(tag)!.add(m.worker_id);
        }
      }
      return [...groups.entries()].map(([name, ids]) => ({
        draft_id: newDraftId(),
        name,
        ou_type: ouType,
        unit_basis: baseUnitBasis({ value: name, tag_category: null }),
        member_ids: ids,
      }));
    }

    if (dim === "activist") {
      const links = leaderLinksQuery.data ?? [];
      const groups = new Map<
        number,
        { name: string; member_ids: Set<number> }
      >();
      for (const l of links) {
        if (!groups.has(l.leader_worker_id)) {
          const leaderName = l.leader
            ? `${l.leader.first_name} ${l.leader.last_name}`.trim()
            : `Worker #${l.leader_worker_id}`;
          groups.set(l.leader_worker_id, {
            name: `${leaderName}'s network`,
            member_ids: new Set(),
          });
        }
        groups.get(l.leader_worker_id)!.member_ids.add(l.follower_worker_id);
      }
      return [...groups.entries()].map(([leaderId, g]) => ({
        draft_id: newDraftId(),
        name: g.name,
        ou_type: ouType,
        unit_basis: baseUnitBasis({ leader_worker_id: leaderId, value: leaderId }),
        member_ids: g.member_ids,
      }));
    }

    return [
      {
        draft_id: newDraftId(),
        name: "",
        ou_type: ouType,
        unit_basis: baseUnitBasis({ custom: true }),
        member_ids: new Set(),
      },
    ];
  }

  // Trigger seed when transitioning into "drafts" with empty drafts list.
  useEffect(() => {
    if (step !== "drafts" || drafts.length > 0 || !dimension) return;
    // Wait for dependent queries to resolve (where applicable).
    if (
      (dimension === "shift" && memberShiftIds.length > 0 && !shiftQuery.data) ||
      (dimension === "work_area" && memberWorkAreaIds.length > 0 && !workAreaQuery.data) ||
      (dimension === "roster_panel" && memberRosterIds.length > 0 && !rosterQuery.data) ||
      (dimension === "activist" && !leaderLinksQuery.data)
    ) {
      return;
    }
    setDrafts(seedDraftsFromDimension(dimension));
    setActiveDraftIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    dimension,
    shiftQuery.data,
    workAreaQuery.data,
    rosterQuery.data,
    leaderLinksQuery.data,
  ]);

  // ── Mutation: split RPC ───────────────────────────────────────────────
  const splitMutation = useAuthAwareMutation({
    mutationFn: async (): Promise<SplitOuRpcResultRow[]> => {
      const validDrafts = drafts.filter((d) => d.name.trim().length > 0);
      if (validDrafts.length === 0) {
        throw new Error("At least one sub-unit needs a name.");
      }
      const subUnitsPayload = validDrafts.map((d) => ({
        name: d.name.trim(),
        ou_type: d.ou_type,
        unit_basis: d.unit_basis,
        total_workers_estimated: null,
      }));
      const assignmentsPayload: { sub_index: number; worker_id: number }[] = [];
      validDrafts.forEach((d, idx) => {
        for (const wid of d.member_ids) {
          assignmentsPayload.push({ sub_index: idx, worker_id: wid });
        }
      });
      const { data, error } = await supabase.rpc("split_campaign_organising_unit", {
        p_parent_ou_id: parent.ou_id,
        p_sub_units: subUnitsPayload,
        p_assignments: assignmentsPayload,
        p_keep_in_parent: keepInParent,
      });
      if (error) throw error;
      return (data ?? []) as SplitOuRpcResultRow[];
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["campaign-ous", String(campaignId)] });
      qc.invalidateQueries({ queryKey: ["campaign-worker-ou", String(campaignId)] });
      qc.invalidateQueries({ queryKey: ["campaign-units", String(campaignId)] });
      qc.invalidateQueries({ queryKey: ["campaign-unit-hierarchy-summary", String(campaignId)] });
      const totalAssigned = drafts.reduce((sum, d) => sum + d.member_ids.size, 0);
      onSplit?.({ createdOuIds: created.map((r) => r.ou_id), assignedWorkers: totalAssigned });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : "Could not split unit.");
    },
  });

  // ── Helpers for the assignment grid ───────────────────────────────────
  const draftByMember = useMemo(() => {
    const map = new Map<number, number>(); // worker_id -> draft index
    drafts.forEach((d, idx) => {
      for (const wid of d.member_ids) map.set(wid, idx);
    });
    return map;
  }, [drafts]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => workerLabel(m).toLowerCase().includes(q));
  }, [members, searchQuery]);

  const [pendingMemberIds, setPendingMemberIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (step !== "assign") setPendingMemberIds(new Set());
  }, [step]);

  function togglePending(workerId: number) {
    setPendingMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  }

  function selectAllFiltered() {
    setPendingMemberIds(new Set(filteredMembers.map((m) => m.worker_id)));
  }

  function clearPending() {
    setPendingMemberIds(new Set());
  }

  function moveSelectedToDraft(targetIndex: number) {
    if (pendingMemberIds.size === 0) return;
    setDrafts((prev) => {
      const next = prev.map((d) => ({ ...d, member_ids: new Set(d.member_ids) }));
      // Strip from any existing draft
      for (const d of next) {
        for (const wid of [...pendingMemberIds]) d.member_ids.delete(wid);
      }
      if (targetIndex >= 0 && targetIndex < next.length) {
        for (const wid of pendingMemberIds) next[targetIndex].member_ids.add(wid);
      }
      return next;
    });
    setPendingMemberIds(new Set());
  }

  function addEmptyDraft() {
    setDrafts((prev) => [
      ...prev,
      {
        draft_id: newDraftId(),
        name: "",
        ou_type: dimension ? DIMENSION_TO_OU_TYPE[dimension] : "custom",
        unit_basis: { parent_ou_id: parent.ou_id, dimension: dimension ?? "custom", custom: true },
        member_ids: new Set(),
      },
    ]);
    setActiveDraftIndex(drafts.length);
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setActiveDraftIndex((idx) => Math.max(0, Math.min(idx, drafts.length - 2)));
  }

  function renameDraft(index: number, name: string) {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name };
      return next;
    });
  }

  function setDraftOuType(index: number, ouType: CampaignOuType) {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ou_type: ouType };
      return next;
    });
  }

  // ── Step rendering ────────────────────────────────────────────────────
  const totalAssigned = useMemo(
    () => drafts.reduce((sum, d) => sum + d.member_ids.size, 0),
    [drafts]
  );

  const validDraftCount = drafts.filter((d) => d.name.trim().length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Split &ldquo;{ouDisplayName(parent)}&rdquo; into sub-units
          </DialogTitle>
          <DialogDescription>
            Create smaller component units under this organising unit. Workers in a sub-unit can
            stay in the parent for roll-up reporting (default), or move into the sub-unit only.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-2 border-b">
          <StepIndicator step={step} />
        </div>

        <div className="flex-1 overflow-hidden px-6 py-4">
          {step === "dimension" && (
            <DimensionStep
              available={availableDimensions}
              value={dimension}
              onChange={setDimension}
            />
          )}

          {step === "drafts" && (
            <DraftsStep
              drafts={drafts}
              members={members}
              onRename={renameDraft}
              onSetOuType={setDraftOuType}
              onAdd={addEmptyDraft}
              onRemove={removeDraft}
            />
          )}

          {step === "assign" && (
            <AssignStep
              drafts={drafts}
              members={filteredMembers}
              draftByMember={draftByMember}
              pendingMemberIds={pendingMemberIds}
              activeDraftIndex={activeDraftIndex}
              onActivateDraft={setActiveDraftIndex}
              onToggleMember={togglePending}
              onSelectAll={selectAllFiltered}
              onClearPending={clearPending}
              onMoveToDraft={moveSelectedToDraft}
              onMoveToParent={() => moveSelectedToDraft(-1)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          )}

          {step === "review" && (
            <ReviewStep
              drafts={drafts.filter((d) => d.name.trim().length > 0)}
              parent={parent}
              keepInParent={keepInParent}
              onKeepInParentChange={setKeepInParent}
              totalAssigned={totalAssigned}
              membersTotal={members.length}
            />
          )}

          {errorMessage && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t flex-row sm:justify-between items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {validDraftCount > 0 && step !== "dimension" && (
              <>
                {validDraftCount} sub-unit{validDraftCount === 1 ? "" : "s"} · {totalAssigned}{" "}
                worker{totalAssigned === 1 ? "" : "s"} assigned
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {step !== "dimension" && (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === "drafts") setStep("dimension");
                  else if (step === "assign") setStep("drafts");
                  else if (step === "review") setStep("assign");
                }}
                disabled={splitMutation.isPending}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>
            )}
            {step !== "review" ? (
              <Button
                onClick={() => {
                  if (step === "dimension") {
                    if (!dimension) return;
                    setStep("drafts");
                  } else if (step === "drafts") {
                    setStep("assign");
                  } else if (step === "assign") {
                    setStep("review");
                  }
                }}
                disabled={
                  (step === "dimension" && !dimension) ||
                  (step === "drafts" && validDraftCount === 0)
                }
              >
                Continue
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setErrorMessage(null);
                  splitMutation.mutate();
                }}
                disabled={splitMutation.isPending || validDraftCount === 0}
              >
                {splitMutation.isPending ? "Splitting…" : `Create ${validDraftCount} sub-unit${validDraftCount === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "dimension", label: "Dimension" },
    { key: "drafts", label: "Sub-units" },
    { key: "assign", label: "Assign workers" },
    { key: "review", label: "Review" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                    ? "bg-muted text-muted-foreground"
                    : "bg-background text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
            {i < steps.length - 1 && (
              <span className="text-muted-foreground/50 mx-1">·</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function DimensionStep({
  available,
  value,
  onChange,
}: {
  available: { dimension: CampaignOuSplitDimension; label: string; sample: number }[];
  value: CampaignOuSplitDimension | null;
  onChange: (d: CampaignOuSplitDimension) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick a worker attribute to split this unit on. We&apos;ll suggest sub-units based on the
        distinct values among the current members.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {available.map((opt) => {
          const selected = value === opt.dimension;
          const empty = opt.sample === 0 && opt.dimension !== "custom";
          return (
            <button
              key={opt.dimension}
              type="button"
              className={`text-left rounded border p-3 transition ${
                selected
                  ? "border-primary ring-1 ring-primary bg-primary/5"
                  : empty
                    ? "border-dashed text-muted-foreground hover:bg-muted/50"
                    : "hover:bg-muted/50"
              }`}
              onClick={() => onChange(opt.dimension)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{opt.label}</span>
                {opt.sample > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {opt.sample} value{opt.sample === 1 ? "" : "s"}
                  </Badge>
                )}
                {opt.sample === 0 && opt.dimension !== "custom" && (
                  <Badge variant="outline" className="text-[10px]">
                    no data
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {dimensionDescription(opt.dimension)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function dimensionDescription(d: CampaignOuSplitDimension): string {
  switch (d) {
    case "occupation":
      return "Group by canonical occupation.";
    case "shift":
      return "Group by the shift assigned on each worker.";
    case "work_area":
      return "Group by the work area / department on each worker.";
    case "roster_panel":
      return "Group by roster, panel or crew label.";
    case "tag":
      return "Group by worker tag (one sub-unit per tag).";
    case "activist":
      return "Group by the leader the worker is linked to via Link to leader.";
    case "custom":
      return "Define sub-units yourself and assign workers manually.";
  }
}

function DraftsStep({
  drafts,
  members,
  onRename,
  onSetOuType,
  onAdd,
  onRemove,
}: {
  drafts: SubUnitDraft[];
  members: SplitMember[];
  onRename: (i: number, name: string) => void;
  onSetOuType: (i: number, ouType: CampaignOuType) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const totalMembers = members.length;
  return (
    <ScrollArea className="h-[55vh] pr-2">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Review the suggested sub-units. Edit names, change types, or add a custom row. Counts show
          the seeded membership which you can adjust in the next step.
        </p>
        {drafts.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            No suggestions for this dimension. Add a custom sub-unit below.
          </p>
        )}
        <div className="space-y-2">
          {drafts.map((d, i) => (
            <div
              key={d.draft_id}
              className="rounded border p-3 grid grid-cols-12 gap-2 items-end"
            >
              <div className="col-span-12 sm:col-span-6 space-y-1">
                <Label htmlFor={`name-${d.draft_id}`} className="text-xs">
                  Sub-unit name
                </Label>
                <Input
                  id={`name-${d.draft_id}`}
                  value={d.name}
                  onChange={(e) => onRename(i, e.target.value)}
                  placeholder="e.g. Day shift"
                />
              </div>
              <div className="col-span-7 sm:col-span-3 space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={d.ou_type}
                  onValueChange={(v) => onSetOuType(i, v as CampaignOuType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "shift",
                        "department",
                        "network",
                        "job_type",
                        "work_area",
                        "crew_rotation",
                        "accommodation",
                        "ethnic_community",
                        "custom",
                      ] satisfies CampaignOuType[]
                    ).map((t) => (
                      <SelectItem key={t} value={t}>
                        {humanizeOuType(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 sm:col-span-2 text-xs text-muted-foreground">
                {d.member_ids.size} / {totalMembers} seeded
              </div>
              <div className="col-span-2 sm:col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(i)}
                  aria-label="Remove sub-unit"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add sub-unit
        </Button>
      </div>
    </ScrollArea>
  );
}

function AssignStep({
  drafts,
  members,
  draftByMember,
  pendingMemberIds,
  activeDraftIndex,
  onActivateDraft,
  onToggleMember,
  onSelectAll,
  onClearPending,
  onMoveToDraft,
  onMoveToParent,
  searchQuery,
  onSearchChange,
}: {
  drafts: SubUnitDraft[];
  members: SplitMember[];
  draftByMember: Map<number, number>;
  pendingMemberIds: Set<number>;
  activeDraftIndex: number;
  onActivateDraft: (i: number) => void;
  onToggleMember: (workerId: number) => void;
  onSelectAll: () => void;
  onClearPending: () => void;
  onMoveToDraft: (i: number) => void;
  onMoveToParent: () => void;
  searchQuery: string;
  onSearchChange: (s: string) => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-3 h-[60vh]">
      <div className="col-span-12 lg:col-span-7 flex flex-col rounded border">
        <div className="border-b px-3 py-2 flex items-center gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search members…"
            className="h-8"
          />
          <Button size="sm" variant="outline" className="h-7" onClick={onSelectAll}>
            Select all visible
          </Button>
          {pendingMemberIds.size > 0 && (
            <Button size="sm" variant="ghost" className="h-7" onClick={onClearPending}>
              Clear ({pendingMemberIds.size})
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1">
          <ul className="divide-y">
            {members.map((m) => {
              const assignedDraftIndex = draftByMember.get(m.worker_id) ?? -1;
              const assignedDraft = assignedDraftIndex >= 0 ? drafts[assignedDraftIndex] : null;
              const checked = pendingMemberIds.has(m.worker_id);
              return (
                <li
                  key={m.worker_id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleMember(m.worker_id)}
                    aria-label={`Select ${workerLabel(m)}`}
                  />
                  <span className="text-sm flex-1 truncate">{workerLabel(m)}</span>
                  {m.canonical_occupation_name && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      {m.canonical_occupation_name}
                    </span>
                  )}
                  {assignedDraft && (
                    <Badge variant="secondary" className="text-[10px]">
                      → {assignedDraft.name || `Sub-unit ${assignedDraftIndex + 1}`}
                    </Badge>
                  )}
                </li>
              );
            })}
            {members.length === 0 && (
              <li className="px-3 py-6 text-sm text-center text-muted-foreground">
                No members match the search.
              </li>
            )}
          </ul>
        </ScrollArea>
      </div>

      <div className="col-span-12 lg:col-span-5 flex flex-col rounded border">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          {pendingMemberIds.size === 0
            ? "Tick members on the left, then move them into a sub-unit."
            : `Move ${pendingMemberIds.size} selected member${pendingMemberIds.size === 1 ? "" : "s"} to:`}
        </div>
        <ScrollArea className="flex-1">
          <ul className="divide-y">
            {drafts.map((d, i) => (
              <li
                key={d.draft_id}
                className={`px-3 py-2 flex items-center justify-between gap-2 ${
                  activeDraftIndex === i ? "bg-muted/40" : ""
                }`}
              >
                <button
                  type="button"
                  className="text-left flex-1 min-w-0"
                  onClick={() => onActivateDraft(i)}
                >
                  <div className="text-sm font-medium truncate">
                    {d.name || `Sub-unit ${i + 1}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {humanizeOuType(d.ou_type)} · {d.member_ids.size} member
                    {d.member_ids.size === 1 ? "" : "s"}
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  disabled={pendingMemberIds.size === 0}
                  onClick={() => onMoveToDraft(i)}
                >
                  Assign
                </Button>
              </li>
            ))}
            <li className="px-3 py-2 flex items-center justify-between gap-2 border-t bg-muted/20">
              <div>
                <div className="text-sm font-medium">Parent only</div>
                <div className="text-[10px] text-muted-foreground">
                  Stay in &ldquo;parent&rdquo; without joining a sub-unit
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={pendingMemberIds.size === 0}
                onClick={onMoveToParent}
              >
                Unassign
              </Button>
            </li>
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
}

function ReviewStep({
  drafts,
  parent,
  keepInParent,
  onKeepInParentChange,
  totalAssigned,
  membersTotal,
}: {
  drafts: SubUnitDraft[];
  parent: WallChartOU;
  keepInParent: boolean;
  onKeepInParentChange: (b: boolean) => void;
  totalAssigned: number;
  membersTotal: number;
}) {
  const unassigned = membersTotal - totalAssigned;
  return (
    <div className="space-y-4">
      <div className="rounded border p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Keep workers in &ldquo;{ouDisplayName(parent)}&rdquo; too</div>
            <p className="text-xs text-muted-foreground">
              When on (recommended), workers added to a sub-unit stay assigned to the parent so
              parent-level counts and roll-ups continue to include them. Turn off if the parent
              should dissolve into its sub-units.
            </p>
          </div>
          <Switch checked={keepInParent} onCheckedChange={onKeepInParentChange} />
        </div>
      </div>

      <div className="rounded border">
        <div className="px-3 py-2 border-b text-xs uppercase tracking-wide text-muted-foreground">
          Sub-units to create
        </div>
        <ul className="divide-y">
          {drafts.map((d) => (
            <li key={d.draft_id} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{d.name}</div>
                <div className="text-[10px] text-muted-foreground">{humanizeOuType(d.ou_type)}</div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {d.member_ids.size} member{d.member_ids.size === 1 ? "" : "s"}
              </Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="text-xs text-muted-foreground">
        {totalAssigned} of {membersTotal} parent member{membersTotal === 1 ? "" : "s"} assigned to a
        sub-unit
        {unassigned > 0 && <> · {unassigned} will remain in the parent only</>}.
      </div>
    </div>
  );
}
