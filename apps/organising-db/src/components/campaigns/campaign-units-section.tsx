"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { formatWorkerLabel } from "@/lib/workers/format-worker-label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Pencil, Lightbulb, RefreshCw, Trash2, Layers, MoreVertical } from "lucide-react";
import type { CampaignOuType, OuCandidateStatus } from "@/types/database";
import { generateOuCandidatesFromWtp } from "@/lib/campaign/generate-ou-candidates";
import { recomputeOuAssignments } from "@/lib/campaign/recompute-ou-assignments";
import {
  getCampaignMembershipStatus,
  type CampaignMembershipStatus,
} from "@/lib/campaign/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SplitUnitDialog, type SplitMember } from "./wall-chart/split-unit-dialog";
import { CreateOrganisingUnitDialog } from "./wall-chart/create-organising-unit-dialog";
import {
  DeleteOrganisingUnitDialog,
  type DeleteUnitWorker,
} from "./wall-chart/delete-organising-unit-dialog";
import { CampaignWorkerNameButton } from "./campaign-worker-detail-provider";
import { CampaignWorkerAssignmentPicker } from "./campaign-worker-assignment-picker";
import type { WallChartOU } from "./wall-chart/types";

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

type UnitRule = {
  rule_id: number;
  ou_id: number;
  include: boolean;
  dimension_type: string;
  operator: string;
  value_int: number | null;
  value_text: string | null;
};

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

function normalizeMemberWorker(m: unknown): {
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
  const row = m as CampaignMemberRow;
  const wr = row.worker;
  const w = (Array.isArray(wr) ? wr[0] : wr) as MemberWorkerRow | null;
  if (!w) return null;
  const employer = Array.isArray(w.employer) ? w.employer[0] : w.employer;
  const worksite = Array.isArray(w.worksite) ? w.worksite[0] : w.worksite;
  const memberRole = Array.isArray(w.member_role_type) ? w.member_role_type[0] : w.member_role_type;
  const unionMembershipType = Array.isArray(w.union_membership_type)
    ? w.union_membership_type[0]
    : w.union_membership_type;
  return {
    worker_id: row.worker_id,
    first_name: w.first_name ?? null,
    last_name: w.last_name ?? null,
    preferred_name: w.preferred_name ?? null,
    employer_name: employer?.employer_name ?? null,
    worksite_name: worksite?.worksite_name ?? null,
    member_role_name: memberRole?.role_name ?? null,
    union_membership_type_name: unionMembershipType?.type_name ?? null,
    is_bargaining_rep: w.is_bargaining_rep ?? null,
  };
}

function workerDisplayName(worker: ReturnType<typeof normalizeMemberWorker>) {
  if (!worker) return "Worker";
  return formatWorkerLabel(worker.worker_id, {
    first_name: worker.first_name,
    last_name: worker.last_name,
    preferred_name: worker.preferred_name,
  });
}

const RULE_DIMENSIONS = [
  { value: "employer", label: "Employer (id)" },
  { value: "worksite", label: "Worksite (id)" },
  { value: "occupation", label: "Occupation" },
  { value: "occupation_grouping", label: "Occupation grouping" },
  { value: "shift", label: "Shift (via worker tag)" },
  { value: "work_area", label: "Work area (via worker tag)" },
  { value: "relational", label: "Relational (via worker tag)" },
];

export function CampaignUnitsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [ouDialog, setOuDialog] = useState(false);
  const [editingOuId, setEditingOuId] = useState<number | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [ouForm, setOuForm] = useState({
    name: "",
    ou_type: "department" as CampaignOuType,
    total_workers_estimated: "",
    anchor_worker_id: "" as string,
    commonality_logic: "",
    target_size: "",
  });
  const [assignDialog, setAssignDialog] = useState<{ ou_id: number; name: string } | null>(null);
  const [selectedAssignWorkerIds, setSelectedAssignWorkerIds] = useState<Set<number>>(new Set());
  const [assignPrimary, setAssignPrimary] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingConflictCount, setPendingConflictCount] = useState(0);
  const [pendingNewCount, setPendingNewCount] = useState(0);
  const [assignFeedback, setAssignFeedback] = useState<string | null>(null);
  const [ruleFormByOu, setRuleFormByOu] = useState<
    Record<number, { include: boolean; dimension_type: string; operator: string; value: string }>
  >({});
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  // Per-OU bulk selection. Only one OU can have an active selection at a time.
  const [unitSelection, setUnitSelection] = useState<{
    ouId: number;
    workerIds: Set<number>;
  } | null>(null);

  // Selection for the Unallocated pseudo-unit.
  const [unallocatedSelection, setUnallocatedSelection] = useState<Set<number>>(new Set());

  // Source OU + workers pending reallocation — opens the reallocate dialog.
  // fromOuId: null means the workers are currently unallocated (assign, not move).
  const [reallocateTarget, setReallocateTarget] = useState<{
    fromOuId: number | null;
    fromOuType: string | null;
    workerIds: number[];
  } | null>(null);
  const [reallocateSelectedOuId, setReallocateSelectedOuId] = useState<string>("");

  // Confirm dialog state for single or bulk remove from unit.
  const [removeConfirmState, setRemoveConfirmState] = useState<{
    ouId: number;
    workerIds: number[];
  } | null>(null);

  // OU currently being split into sub-units.
  const [splitTargetOu, setSplitTargetOu] = useState<WallChartOU | null>(null);
  const [deleteTargetOuId, setDeleteTargetOuId] = useState<number | null>(null);

  const { data: members = [] } = useQuery({
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
      return data ?? [];
    },
  });

  // Options for employer/worksite ID rules so the user picks a real record
  // (and a valid numeric id) instead of typing a raw id into a text box.
  const { data: ruleEmployers = [] } = useQuery({
    queryKey: ["rule-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .eq("is_active", true)
        .order("employer_name");
      if (error) throw error;
      return (data ?? []) as { employer_id: number; employer_name: string }[];
    },
  });

  const { data: ruleWorksites = [] } = useQuery({
    queryKey: ["rule-worksites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .order("worksite_name");
      if (error) throw error;
      return (data ?? []) as { worksite_id: number; worksite_name: string }[];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ouIdsKey = ous.map((o: { ou_id: number }) => o.ou_id).join(",");

  const { data: ouAssignments = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId, ouIdsKey],
    queryFn: async () => {
      const ouIds = ous.map((o: { ou_id: number }) => o.ou_id);
      if (ouIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select(
          `id, ou_id, worker_id, is_primary, assignment_source,
           worker:workers(worker_id, first_name, last_name)`
        )
        .in("ou_id", ouIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: ous.length > 0,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["campaign-unit-rules", campaignId],
    queryFn: async () => {
      const scoped = supabase as unknown as {
        from: (table: string) => {
          select: (query: string) => { eq: (col: string, value: unknown) => Promise<{ data: UnitRule[]; error: Error | null }> };
        };
      };
      const { data, error } = await scoped
        .from("campaign_unit_rules")
        .select("rule_id, ou_id, include, dimension_type, operator, value_int, value_text")
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: coverage } = useQuery({
    queryKey: ["campaign-ou-coverage", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ou_coverage_summary")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as {
        total_ous: number;
        sized_ous: number;
        ous_with_contact: number;
        ous_with_activist: number;
        ous_with_delegate: number;
        ous_with_anchor: number;
        total_estimated_workers: number;
        total_assigned_workers: number;
      } | null;
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["campaign-ou-candidates", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ou_candidates")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .eq("status", "suggested")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const memberUnitCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of ouAssignments) {
      counts.set(row.worker_id, (counts.get(row.worker_id) ?? 0) + 1);
    }
    return counts;
  }, [ouAssignments]);

  const multiUnitWorkerIds = useMemo(
    () => new Set([...memberUnitCount.entries()].filter(([, c]) => c > 1).map(([id]) => id)),
    [memberUnitCount]
  );

  const assignTargetAssignedWorkerIds = useMemo(() => {
    if (!assignDialog) return new Set<number>();
    return new Set(
      ouAssignments
        .filter((row: { ou_id: number }) => row.ou_id === assignDialog.ou_id)
        .map((row: { worker_id: number }) => row.worker_id)
    );
  }, [assignDialog, ouAssignments]);

  const memberOptions = useMemo(() => {
    return (members as CampaignMemberRow[])
      .map((member) => {
        const normalized = normalizeMemberWorker(member);
        if (!normalized) return null;
        const membershipStatus = getCampaignMembershipStatus({
          memberRoleName: normalized.member_role_name ?? undefined,
          unionMembershipTypeName: normalized.union_membership_type_name ?? undefined,
          isBargainingRep: normalized.is_bargaining_rep,
        });
        return {
          membership_id: member.membership_id,
          worker_id: normalized.worker_id,
          label: workerDisplayName(normalized),
          employer_name: normalized.employer_name ?? "—",
          worksite_name: normalized.worksite_name ?? "—",
          organising_role: normalized.member_role_name ?? "none",
          membership_status: membershipStatus,
          unit_count: memberUnitCount.get(normalized.worker_id) ?? 0,
          is_multi_unit_member: multiUnitWorkerIds.has(normalized.worker_id),
          is_already_assigned: assignTargetAssignedWorkerIds.has(normalized.worker_id),
        };
      })
      .filter(
        (
          row
        ): row is {
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
        } => !!row
      );
  }, [members, memberUnitCount, multiUnitWorkerIds, assignTargetAssignedWorkerIds]);

  // Workers in campaign but not assigned to any OU — shown in the Unallocated pseudo-unit.
  const assignedWorkerIds = useMemo(
    () => new Set(ouAssignments.map((a: { worker_id: number }) => a.worker_id)),
    [ouAssignments]
  );

  const unallocatedMembers = useMemo(
    () => memberOptions.filter((m) => !assignedWorkerIds.has(m.worker_id)),
    [memberOptions, assignedWorkerIds]
  );

  const acceptCandidate = useAuthAwareMutation({
    mutationFn: async (c: {
      candidate_id: number;
      suggested_name: string;
      suggested_ou_type: string;
      estimated_workers: number | null;
      commonality_logic: string | null;
    }) => {
      const { data: maxRow } = await supabase
        .from("campaign_organising_units")
        .select("display_order")
        .eq("campaign_id", Number(campaignId))
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: ou, error: ouErr } = await supabase
        .from("campaign_organising_units")
        .insert({
          campaign_id: Number(campaignId),
          name: c.suggested_name,
          ou_type: c.suggested_ou_type,
          total_workers_estimated: c.estimated_workers,
          commonality_logic: c.commonality_logic,
          source: "wtp_seeded",
          display_order: (maxRow?.display_order != null ? Number(maxRow.display_order) : -1) + 1,
        })
        .select("ou_id")
        .single();
      if (ouErr) throw ouErr;

      const { error: upErr } = await supabase
        .from("campaign_ou_candidates")
        .update({ status: "accepted" as OuCandidateStatus, accepted_ou_id: ou.ou_id })
        .eq("candidate_id", c.candidate_id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-candidates", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    },
  });

  const rejectCandidate = useAuthAwareMutation({
    mutationFn: async (candidateId: number) => {
      const { error } = await supabase
        .from("campaign_ou_candidates")
        .update({ status: "rejected" as OuCandidateStatus })
        .eq("candidate_id", candidateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-candidates", campaignId] });
    },
  });

  const generateCandidates = useAuthAwareMutation({
    mutationFn: async () => {
      const result = await generateOuCandidatesFromWtp(supabase, Number(campaignId));
      if (result.error) throw result.error;
      return result.generated;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-candidates", campaignId] });
      setGenerateMessage(
        count > 0
          ? `Generated ${count} suggestion${count === 1 ? "" : "s"}`
          : "No new suggestions available"
      );
      setTimeout(() => setGenerateMessage(null), 4000);
    },
  });

  const createOu = useAuthAwareMutation({
    mutationFn: async () => {
      const { data: maxRow } = await supabase
        .from("campaign_organising_units")
        .select("display_order")
        .eq("campaign_id", Number(campaignId))
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        name: ouForm.name,
        ou_type: ouForm.ou_type,
        display_order: (maxRow?.display_order != null ? Number(maxRow.display_order) : -1) + 1,
        source: "manual",
      };
      if (ouForm.total_workers_estimated) {
        const n = Number(ouForm.total_workers_estimated);
        if (!Number.isNaN(n)) payload.total_workers_estimated = n;
      }
      if (ouForm.anchor_worker_id) {
        payload.anchor_worker_id = Number(ouForm.anchor_worker_id);
      }
      if (ouForm.commonality_logic) {
        payload.commonality_logic = ouForm.commonality_logic;
      }
      if (ouForm.target_size) {
        const n = Number(ouForm.target_size);
        if (!Number.isNaN(n)) payload.target_size = n;
      }
      const { error } = await supabase.from("campaign_organising_units").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setOuDialog(false);
      setEditingOuId(null);
      setOuForm({
        name: "",
        ou_type: "department",
        total_workers_estimated: "",
        anchor_worker_id: "",
        commonality_logic: "",
        target_size: "",
      });
    },
  });

  const updateOu = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      const payload: Record<string, unknown> = {
        name: ouForm.name,
        ou_type: ouForm.ou_type,
        commonality_logic: ouForm.commonality_logic || null,
      };
      if (ouForm.total_workers_estimated) {
        const n = Number(ouForm.total_workers_estimated);
        if (!Number.isNaN(n)) payload.total_workers_estimated = n;
      } else {
        payload.total_workers_estimated = null;
      }
      if (ouForm.anchor_worker_id) {
        payload.anchor_worker_id = Number(ouForm.anchor_worker_id);
      } else {
        payload.anchor_worker_id = null;
      }
      if (ouForm.target_size) {
        const n = Number(ouForm.target_size);
        if (!Number.isNaN(n)) payload.target_size = n;
      } else {
        payload.target_size = null;
      }
      const { error } = await supabase
        .from("campaign_organising_units")
        .update(payload)
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setOuDialog(false);
      setEditingOuId(null);
      setOuForm({
        name: "",
        ou_type: "department",
        total_workers_estimated: "",
        anchor_worker_id: "",
        commonality_logic: "",
        target_size: "",
      });
    },
  });

  const resetAssignDialogState = () => {
    setSelectedAssignWorkerIds(new Set());
    setAssignPrimary(false);
  };

  const assignOu = useAuthAwareMutation({
    mutationFn: async (workerIdsToAssign: number[]) => {
      if (!assignDialog || workerIdsToAssign.length === 0) return { inserted: 0 };
      const rows = workerIdsToAssign.map((workerId) => ({
        ou_id: assignDialog.ou_id,
        worker_id: workerId,
        is_primary: assignPrimary && workerIdsToAssign.length === 1,
        assignment_source: "manual",
      }));
      const { error } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>[]) => Promise<{ error: Error | null }>;
        };
      })
        .from("campaign_worker_ou")
        .insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setAssignFeedback(
        result?.inserted
          ? `Assigned ${result.inserted} worker${result.inserted === 1 ? "" : "s"} to ${assignDialog?.name ?? "unit"}.`
          : "No new workers were assigned."
      );
      setAssignDialog(null);
      resetAssignDialogState();
      setTimeout(() => setAssignFeedback(null), 4500);
    },
  });

  const addRule = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      const f = ruleFormByOu[ouId] ?? {
        include: true,
        dimension_type: "occupation",
        operator: "contains",
        value: "",
      };
      if (!f.value.trim()) throw new Error("Rule value is required");
      const isIdDimension = f.dimension_type === "employer" || f.dimension_type === "worksite";
      if (isIdDimension && !Number.isFinite(Number(f.value))) {
        throw new Error(`Choose a ${f.dimension_type} from the list.`);
      }
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        ou_id: ouId,
        include: f.include,
        dimension_type: f.dimension_type,
        operator: isIdDimension ? "equals" : f.operator,
        value_text: isIdDimension ? null : f.value.trim(),
        value_int: isIdDimension ? Number(f.value) : null,
      };
      const scoped = supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
        };
      };
      const { error } = await scoped.from("campaign_unit_rules").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-unit-rules", campaignId] });
    },
  });

  const recomputeRules = useAuthAwareMutation({
    mutationFn: async () => recomputeOuAssignments(supabase, Number(campaignId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
    },
  });

  const removeFromUnitMutation = useAuthAwareMutation({
    mutationFn: async ({ ouId, workerIds }: { ouId: number; workerIds: number[] }) => {
      const { error } = await supabase
        .from("campaign_worker_ou" as never)
        .delete()
        .eq("ou_id", ouId)
        .in("worker_id", workerIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setUnitSelection(null);
      setRemoveConfirmState(null);
    },
    onError: (e: Error) => window.alert(e.message || "Could not remove workers from unit"),
  });

  const reallocateToUnitMutation = useAuthAwareMutation({
    mutationFn: async ({
      fromOuId,
      toOuId,
      workerIds,
    }: {
      fromOuId: number | null;
      toOuId: number;
      workerIds: number[];
    }) => {
      const rows = workerIds.map((id) => ({
        ou_id: toOuId,
        worker_id: id,
        assignment_source: "manual",
        is_primary: false,
      }));
      const { error: insErr } = await (supabase as unknown as {
        from: (table: string) => {
          upsert: (
            rows: unknown[],
            opts: { onConflict: string; ignoreDuplicates: boolean }
          ) => Promise<{ error: Error | null }>;
        };
      })
        .from("campaign_worker_ou")
        .upsert(rows, { onConflict: "ou_id,worker_id", ignoreDuplicates: true });
      if (insErr) throw insErr;

      // Only remove from source when source is a real unit (not coming from Unallocated).
      if (fromOuId !== null) {
        const { error: delErr } = await supabase
          .from("campaign_worker_ou" as never)
          .delete()
          .eq("ou_id", fromOuId)
          .in("worker_id", workerIds);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setUnitSelection(null);
      setUnallocatedSelection(new Set());
      setReallocateTarget(null);
      setReallocateSelectedOuId("");
    },
    onError: (e: Error) => window.alert(e.message || "Could not reallocate workers"),
  });

  const rulesByOu = useMemo(() => {
    const map: Record<number, UnitRule[]> = {};
    for (const r of rules) {
      if (!map[r.ou_id]) map[r.ou_id] = [];
      map[r.ou_id].push(r);
    }
    return map;
  }, [rules]);

  // Group OUs into a parent → children tree (one level deep).
  type AnyOu = {
    ou_id: number;
    name: string;
    ou_type: string;
    total_workers_estimated: number | null;
    commonality_logic?: string | null;
    source?: string | null;
    parent_ou_id?: number | null;
    unit_basis?: Record<string, unknown> | null;
  };
  const ousTyped = ous as AnyOu[];
  const childrenByParent = useMemo(() => {
    const m = new Map<number, AnyOu[]>();
    for (const o of ousTyped) {
      if (o.parent_ou_id == null) continue;
      const list = m.get(o.parent_ou_id) ?? [];
      list.push(o);
      m.set(o.parent_ou_id, list);
    }
    return m;
  }, [ousTyped]);
  const topLevelOus = useMemo(
    () => ousTyped.filter((o) => o.parent_ou_id == null),
    [ousTyped]
  );

  const deleteTargetOu = useMemo(
    () => (deleteTargetOuId != null ? ousTyped.find((o) => o.ou_id === deleteTargetOuId) ?? null : null),
    [deleteTargetOuId, ousTyped]
  );

  const deleteUnitWorkers = useMemo((): DeleteUnitWorker[] => {
    if (!deleteTargetOu) return [];
    return (ouAssignments as { ou_id: number; worker_id: number; is_primary?: boolean }[])
      .filter((a) => a.ou_id === deleteTargetOu.ou_id)
      .map((a) => {
        const memberOption = memberOptions.find((m) => m.worker_id === a.worker_id);
        return {
          worker_id: a.worker_id,
          label: memberOption?.label ?? `Worker #${a.worker_id}`,
          is_primary: a.is_primary,
        };
      });
  }, [deleteTargetOu, ouAssignments, memberOptions]);

  // ── Split dialog: members for the targeted OU ─────────────────────────
  const splitMemberWorkerIds = useMemo(() => {
    if (!splitTargetOu) return [] as number[];
    return (ouAssignments as { ou_id: number; worker_id: number }[])
      .filter((r) => r.ou_id === splitTargetOu.ou_id)
      .map((r) => r.worker_id);
  }, [splitTargetOu, ouAssignments]);

  const { data: splitMembers = [] } = useQuery({
    queryKey: [
      "split-unit-members-universe",
      splitTargetOu?.ou_id ?? "none",
      splitMemberWorkerIds.join(","),
    ],
    enabled: !!splitTargetOu && splitMemberWorkerIds.length > 0,
    queryFn: async (): Promise<SplitMember[]> => {
      if (splitMemberWorkerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workers")
        .select(
          `worker_id, first_name, last_name,
           shift_id, work_area_id, roster_panel_id,
           canonical_occupation_id,
           canonical_occupation:occupations!workers_canonical_occupation_id_fkey(canonical_name)`
        )
        .in("worker_id", splitMemberWorkerIds);
      if (error) throw error;
      const { data: tagRows, error: tagErr } = await supabase
        .from("worker_tags")
        .select("worker_id, tag:tags(tag_name)")
        .in("worker_id", splitMemberWorkerIds);
      if (tagErr) throw tagErr;
      const tagsByWorker = new Map<number, string[]>();
      for (const row of (tagRows ?? []) as Array<{
        worker_id: number;
        tag: { tag_name?: string } | { tag_name?: string }[] | null;
      }>) {
        const t = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const name = t?.tag_name?.trim().toLowerCase();
        if (!name) continue;
        const list = tagsByWorker.get(row.worker_id) ?? [];
        list.push(name);
        tagsByWorker.set(row.worker_id, list);
      }
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const occRel = r.canonical_occupation;
        const occ = (Array.isArray(occRel) ? occRel[0] : occRel) as
          | { canonical_name: string }
          | null;
        return {
          worker_id: r.worker_id as number,
          first_name: r.first_name as string,
          last_name: r.last_name as string,
          canonical_occupation_id: (r.canonical_occupation_id as number | null) ?? null,
          canonical_occupation_name: occ?.canonical_name ?? null,
          shift_id: (r.shift_id as number | null) ?? null,
          work_area_id: (r.work_area_id as number | null) ?? null,
          roster_panel_id: (r.roster_panel_id as number | null) ?? null,
          tag_names: tagsByWorker.get(r.worker_id as number) ?? [],
        };
      });
    },
  });

  const selectedCount = selectedAssignWorkerIds.size;
  const beginBulkAssign = () => {
    if (!assignDialog || selectedAssignWorkerIds.size === 0) return;
    const selectedIds = [...selectedAssignWorkerIds];
    const alreadyAssigned = selectedIds.filter((id) => assignTargetAssignedWorkerIds.has(id));
    const newIds = selectedIds.filter((id) => !assignTargetAssignedWorkerIds.has(id));
    setPendingConflictCount(alreadyAssigned.length);
    setPendingNewCount(newIds.length);

    if (newIds.length === 0) {
      setAssignFeedback("All selected workers are already assigned to this unit.");
      setTimeout(() => setAssignFeedback(null), 4500);
      return;
    }

    if (alreadyAssigned.length > 0) {
      setConflictDialogOpen(true);
      return;
    }

    assignOu.mutate(newIds);
  };

  const confirmAssignIgnoringConflicts = () => {
    if (!assignDialog || selectedAssignWorkerIds.size === 0) {
      setConflictDialogOpen(false);
      return;
    }
    const newIds = [...selectedAssignWorkerIds].filter((id) => !assignTargetAssignedWorkerIds.has(id));
    setConflictDialogOpen(false);
    if (newIds.length === 0) return;
    assignOu.mutate(newIds);
  };

  // Per-OU worker selection helpers. Selecting in a different OU clears the previous.
  const toggleUnitWorker = (ouId: number, workerId: number) => {
    setUnitSelection((prev) => {
      const base = prev?.ouId === ouId ? prev.workerIds : new Set<number>();
      const next = new Set(base);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next.size === 0 ? null : { ouId, workerIds: next };
    });
  };
  const selectAllInUnit = (ouId: number, workerIds: number[]) =>
    setUnitSelection({ ouId, workerIds: new Set(workerIds) });
  const isUnitWorkerSelected = (ouId: number, workerId: number) =>
    unitSelection?.ouId === ouId && unitSelection.workerIds.has(workerId);
  const getUnitSelectionCount = (ouId: number) =>
    unitSelection?.ouId === ouId ? unitSelection.workerIds.size : 0;

  return (
    <div className="space-y-6">
      {coverage && coverage.total_ous > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">OU coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{coverage.total_ous}</p>
                <p className="text-xs text-muted-foreground">Total units</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{coverage.ous_with_contact}</p>
                <p className="text-xs text-muted-foreground">With contact</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{coverage.ous_with_activist}</p>
                <p className="text-xs text-muted-foreground">With activist</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{coverage.total_assigned_workers}</p>
                <p className="text-xs text-muted-foreground">Assigned distinct workers</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{multiUnitWorkerIds.size}</p>
                <p className="text-xs text-muted-foreground">Workers in multiple units</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {candidates.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-lg">
                Suggested units
                <Badge variant="secondary" className="ml-2 text-xs">
                  {candidates.length}
                </Badge>
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Based on Where to Play selections in the OA Planner. Review and accept to create organising units.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidates.map((c: {
              candidate_id: number;
              suggested_name: string;
              suggested_ou_type: string;
              source: string;
              estimated_workers: number | null;
              commonality_logic: string | null;
            }) => (
              <div key={c.candidate_id} className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50/50">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{c.suggested_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.suggested_ou_type?.replace(/_/g, " ")}
                    {c.estimated_workers != null && ` · est. ${c.estimated_workers} workers`}
                    {c.source && ` · source: ${c.source.replace(/_/g, " ")}`}
                  </p>
                  {c.commonality_logic && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">{c.commonality_logic}</p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                      onClick={() => acceptCandidate.mutate(c)}
                      title="Accept"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      onClick={() => rejectCandidate.mutate(c.candidate_id)}
                      title="Reject"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setEditingOuId(null);
                        setOuForm({
                          name: c.suggested_name,
                          ou_type: c.suggested_ou_type as CampaignOuType,
                          total_workers_estimated: c.estimated_workers?.toString() || "",
                          anchor_worker_id: "",
                          commonality_logic: c.commonality_logic || "",
                          target_size: "",
                        });
                        setOuDialog(true);
                      }}
                      title="Customise & create"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Campaign units</CardTitle>
          <div className="flex gap-2 flex-wrap">
            {canWrite && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateCandidates.mutate()}
                  disabled={generateCandidates.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${generateCandidates.isPending ? "animate-spin" : ""}`} />
                  Suggest from plan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recomputeRules.mutate()}
                  disabled={recomputeRules.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recomputeRules.isPending ? "animate-spin" : ""}`} />
                  Recompute rules
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateGroupOpen(true)}
                >
                  New group
                </Button>
                <Button size="sm" onClick={() => setOuDialog(true)}>
                  Add unit
                </Button>
              </>
            )}
          </div>
          {generateMessage && (
            <p className="text-xs text-muted-foreground mt-1">{generateMessage}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {ous.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organising units.</p>
          ) : (
            (() => {
              const renderOuRow = (ou: AnyOu, nested: boolean) => {
                const childList = childrenByParent.get(ou.ou_id) ?? [];
                // Employer "group container" units hold no workers directly — their
                // members live in the vessel sub-units. Surface the rolled-up count
                // and hide assign/rule controls that the DB would reject.
                const isContainer = (ou as { is_group_container?: boolean }).is_group_container === true;
                const rolledWorkerCount = isContainer
                  ? new Set(
                      (ouAssignments as { ou_id: number; worker_id: number }[])
                        .filter((a) => childList.some((c) => c.ou_id === a.ou_id))
                        .map((a) => a.worker_id)
                    ).size
                  : 0;
                return (
              <div
                key={ou.ou_id}
                className={`rounded-md border p-3 space-y-3 ${
                  nested ? "border-l-4 border-l-primary/40 bg-muted/20" : ""
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{ou.name}</p>
                      {childList.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Layers className="h-3 w-3" />
                          {childList.length} sub-unit{childList.length === 1 ? "" : "s"}
                        </Badge>
                      )}
                      {isContainer && (
                        <Badge variant="outline" className="text-[10px]">
                          {rolledWorkerCount} worker{rolledWorkerCount === 1 ? "" : "s"} in sub-units
                        </Badge>
                      )}
                      {nested && (
                        <Badge variant="outline" className="text-[10px]">
                          sub-unit
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ou.ou_type?.replace(/_/g, " ")}
                      {ou.total_workers_estimated != null && ` · est. ${ou.total_workers_estimated}`}
                      {ou.source && ou.source !== "manual" && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">
                          {ou.source.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </p>
                    {ou.commonality_logic && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{ou.commonality_logic}</p>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="Edit unit"
                      onClick={() => {
                        setOuForm({
                          name: ou.name,
                          ou_type: ou.ou_type as CampaignOuType,
                          total_workers_estimated: ou.total_workers_estimated?.toString() || "",
                          anchor_worker_id: "",
                          commonality_logic: ou.commonality_logic || "",
                          target_size: "",
                        });
                        setEditingOuId(ou.ou_id);
                        setOuDialog(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {!isContainer && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAssignDialog({ ou_id: ou.ou_id, name: ou.name });
                          resetAssignDialogState();
                          setAssignFeedback(null);
                        }}
                      >
                        Assign worker
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="More actions"
                          aria-label="Unit actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {!nested && (
                          <DropdownMenuItem
                            onClick={() =>
                              setSplitTargetOu({
                                ou_id: ou.ou_id,
                                campaign_id: Number(campaignId),
                                name: ou.name,
                                ou_type: ou.ou_type,
                                total_workers_estimated: ou.total_workers_estimated,
                                unit_basis: (ou.unit_basis ?? null) as WallChartOU["unit_basis"],
                              })
                            }
                            disabled={
                              (ouAssignments as { ou_id: number }[]).filter(
                                (r) => r.ou_id === ou.ou_id
                              ).length === 0
                            }
                          >
                            <Layers className="h-4 w-4 mr-2" /> Split into sub-units
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {!isContainer && (
                          <DropdownMenuItem
                            onClick={() => {
                              setAssignDialog({ ou_id: ou.ou_id, name: ou.name });
                              resetAssignDialogState();
                              setAssignFeedback(null);
                            }}
                          >
                            Assign workers
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTargetOuId(ou.ou_id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete unit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  )}
                </div>

                {/* Per-OU worker list with checkboxes, bulk actions, and per-row remove */}
                {(() => {
                  const ouWorkers = ouAssignments.filter(
                    (a: { ou_id: number }) => a.ou_id === ou.ou_id
                  );
                  const ouWorkerIds = (ouWorkers as { worker_id: number }[]).map(
                    (a) => a.worker_id
                  );
                  const selCount = getUnitSelectionCount(ou.ou_id);
                  const allSelected =
                    ouWorkerIds.length > 0 &&
                    ouWorkerIds.every((id) => isUnitWorkerSelected(ou.ou_id, id));

                  return (
                    <div className="space-y-1">
                      {/* Bulk action bar — visible when this OU has workers selected */}
                      {canWrite && selCount > 0 && unitSelection?.ouId === ou.ou_id && (
                        <div className="flex flex-wrap items-center gap-2 rounded border bg-primary/10 px-3 py-1.5 text-xs">
                          <span className="font-medium">{selCount} selected</span>
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                setRemoveConfirmState({
                                  ouId: ou.ou_id,
                                  workerIds: [...unitSelection.workerIds],
                                })
                              }
                              disabled={removeFromUnitMutation.isPending}
                            >
                              Remove from unit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                setReallocateTarget({
                                  fromOuId: ou.ou_id,
                                  fromOuType: ou.ou_type,
                                  workerIds: [...unitSelection.workerIds],
                                })
                              }
                            >
                              Reallocate to…
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setUnitSelection(null)}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Worker rows */}
                      {ouWorkers.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-1">No workers assigned.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              {canWrite && (
                                <th className="w-8 px-1 py-1">
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        selectAllInUnit(ou.ou_id, ouWorkerIds);
                                      } else {
                                        setUnitSelection(null);
                                      }
                                    }}
                                    aria-label="Select all workers in unit"
                                  />
                                </th>
                              )}
                              <th className="text-left px-1 py-1 font-medium text-muted-foreground">Worker</th>
                              <th className="text-left px-1 py-1 font-medium text-muted-foreground">Flags</th>
                              {canWrite && <th className="w-8" />}
                            </tr>
                          </thead>
                          <tbody>
                            {(ouWorkers as unknown[]).map((a) => {
                              const row = a as {
                                id: number;
                                worker_id: number;
                                is_primary: boolean;
                                assignment_source?: string | null;
                              };
                              const memberOption = memberOptions.find(
                                (m) => m.worker_id === row.worker_id
                              );
                              const displayName =
                                memberOption?.label ?? `Worker #${row.worker_id}`;
                              const selected = isUnitWorkerSelected(ou.ou_id, row.worker_id);
                              return (
                                <tr
                                  key={row.id}
                                  className={selected ? "bg-primary/5" : undefined}
                                >
                                  {canWrite && (
                                    <td className="px-1 py-1">
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={() =>
                                          toggleUnitWorker(ou.ou_id, row.worker_id)
                                        }
                                        aria-label={`Select ${displayName}`}
                                      />
                                    </td>
                                  )}
                                  <td className="px-1 py-1">
                                    <CampaignWorkerNameButton workerId={row.worker_id}>
                                      {displayName}
                                    </CampaignWorkerNameButton>
                                  </td>
                                  <td className="px-1 py-1 text-muted-foreground space-x-1">
                                    {row.is_primary && <span>(primary)</span>}
                                    {row.assignment_source === "rule" && <span>[rule]</span>}
                                    {multiUnitWorkerIds.has(row.worker_id) && (
                                      <span>[multi-unit]</span>
                                    )}
                                  </td>
                                  {canWrite && (
                                    <td className="px-1 py-1 text-right">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                        title="Remove from unit"
                                        onClick={() =>
                                          setRemoveConfirmState({
                                            ouId: ou.ou_id,
                                            workerIds: [row.worker_id],
                                          })
                                        }
                                        disabled={removeFromUnitMutation.isPending}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}

                <div className="rounded-md border p-2 space-y-2">
                  <p className="text-xs font-medium">Assignment rules</p>
                  {(rulesByOu[ou.ou_id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No rules configured for this unit.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(rulesByOu[ou.ou_id] ?? []).map((r) => (
                        <Badge key={r.rule_id} variant={r.include ? "info" : "destructive"}>
                          {r.include ? "Include" : "Exclude"} {r.dimension_type}:{" "}
                          {r.dimension_type === "employer"
                            ? ruleEmployers.find((e) => e.employer_id === r.value_int)?.employer_name ?? r.value_int ?? "—"
                            : r.dimension_type === "worksite"
                            ? ruleWorksites.find((w) => w.worksite_id === r.value_int)?.worksite_name ?? r.value_int ?? "—"
                            : r.value_text ?? r.value_int ?? "—"}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {isContainer ? (
                    <p className="text-xs text-muted-foreground">
                      This is an employer group — assign workers and rules to the vessel units within it (shown below), not to the group itself.
                    </p>
                  ) : canWrite && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <Select
                        value={(ruleFormByOu[ou.ou_id]?.include ?? true) ? "include" : "exclude"}
                        onValueChange={(v) =>
                          setRuleFormByOu((prev) => ({
                            ...prev,
                            [ou.ou_id]: {
                              include: v === "include",
                              dimension_type: prev[ou.ou_id]?.dimension_type ?? "occupation",
                              operator: prev[ou.ou_id]?.operator ?? "contains",
                              value: prev[ou.ou_id]?.value ?? "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="include">Include</SelectItem>
                          <SelectItem value="exclude">Exclude</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={ruleFormByOu[ou.ou_id]?.dimension_type ?? "occupation"}
                        onValueChange={(v) =>
                          setRuleFormByOu((prev) => ({
                            ...prev,
                            [ou.ou_id]: {
                              include: prev[ou.ou_id]?.include ?? true,
                              dimension_type: v,
                              operator: prev[ou.ou_id]?.operator ?? "contains",
                              value: prev[ou.ou_id]?.value ?? "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RULE_DIMENSIONS.map((d) => (
                            <SelectItem key={d.value} value={d.value}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={ruleFormByOu[ou.ou_id]?.operator ?? "contains"}
                        onValueChange={(v) =>
                          setRuleFormByOu((prev) => ({
                            ...prev,
                            [ou.ou_id]: {
                              include: prev[ou.ou_id]?.include ?? true,
                              dimension_type: prev[ou.ou_id]?.dimension_type ?? "occupation",
                              operator: v,
                              value: prev[ou.ou_id]?.value ?? "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">contains</SelectItem>
                          <SelectItem value="equals">equals</SelectItem>
                        </SelectContent>
                      </Select>

                      {(() => {
                        const dim = ruleFormByOu[ou.ou_id]?.dimension_type ?? "occupation";
                        const setVal = (val: string) =>
                          setRuleFormByOu((prev) => ({
                            ...prev,
                            [ou.ou_id]: {
                              include: prev[ou.ou_id]?.include ?? true,
                              dimension_type: prev[ou.ou_id]?.dimension_type ?? "occupation",
                              operator: prev[ou.ou_id]?.operator ?? "contains",
                              value: val,
                            },
                          }));
                        if (dim === "employer" || dim === "worksite") {
                          const opts =
                            dim === "employer"
                              ? ruleEmployers.map((e) => ({ id: e.employer_id, name: e.employer_name }))
                              : ruleWorksites.map((w) => ({ id: w.worksite_id, name: w.worksite_name }));
                          return (
                            <Select value={ruleFormByOu[ou.ou_id]?.value ?? ""} onValueChange={setVal}>
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder={`Select ${dim}…`} />
                              </SelectTrigger>
                              <SelectContent>
                                {opts.map((o) => (
                                  <SelectItem key={o.id} value={String(o.id)}>
                                    {o.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }
                        return (
                          <Input
                            className="h-8"
                            placeholder="value (text)"
                            value={ruleFormByOu[ou.ou_id]?.value ?? ""}
                            onChange={(e) => setVal(e.target.value)}
                          />
                        );
                      })()}

                      <Button
                        variant="outline"
                        className="h-8"
                        onClick={() => addRule.mutate(ou.ou_id)}
                        disabled={addRule.isPending}
                      >
                        Add rule
                      </Button>
                    </div>
                  )}
                </div>

                {/* Render children (sub-units) nested under their parent */}
                {!nested && childList.length > 0 && (
                  <div className="space-y-3 pl-4 border-l-2 border-muted">
                    {childList.map((c) => renderOuRow(c, true))}
                  </div>
                )}
              </div>
                );
              };
              return topLevelOus.map((ou) => renderOuRow(ou, false));
            })()
          )}

          {/* Unallocated pseudo-unit — workers in campaign with no unit assignment */}
          {ous.length > 0 && unallocatedMembers.length > 0 && (
            <div className="rounded-md border border-dashed p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-muted-foreground">Unallocated</p>
                  <p className="text-xs text-muted-foreground">
                    {unallocatedMembers.length} worker{unallocatedMembers.length !== 1 ? "s" : ""} not in any unit
                  </p>
                </div>
                {canWrite && unallocatedSelection.size > 0 && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        setReallocateTarget({
                          fromOuId: null,
                          fromOuType: null,
                          workerIds: [...unallocatedSelection],
                        })
                      }
                    >
                      Assign to unit…
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setUnallocatedSelection(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {canWrite && (
                      <th className="w-8 px-1 py-1">
                        <Checkbox
                          checked={
                            unallocatedMembers.length > 0 &&
                            unallocatedMembers.every((m) => unallocatedSelection.has(m.worker_id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setUnallocatedSelection(
                                new Set(unallocatedMembers.map((m) => m.worker_id))
                              );
                            } else {
                              setUnallocatedSelection(new Set());
                            }
                          }}
                          aria-label="Select all unallocated workers"
                        />
                      </th>
                    )}
                    <th className="text-left px-1 py-1 font-medium text-muted-foreground">Worker</th>
                    {canWrite && <th className="w-20" />}
                  </tr>
                </thead>
                <tbody>
                  {unallocatedMembers.map((m) => {
                    const selected = unallocatedSelection.has(m.worker_id);
                    return (
                      <tr key={m.worker_id} className={selected ? "bg-primary/5" : undefined}>
                        {canWrite && (
                          <td className="px-1 py-1">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => {
                                setUnallocatedSelection((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.worker_id)) next.delete(m.worker_id);
                                  else next.add(m.worker_id);
                                  return next;
                                });
                              }}
                              aria-label={`Select ${m.label}`}
                            />
                          </td>
                        )}
                        <td className="px-1 py-1">
                          <CampaignWorkerNameButton workerId={m.worker_id}>
                            {m.label}
                          </CampaignWorkerNameButton>
                        </td>
                        {canWrite && (
                          <td className="px-1 py-1 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setReallocateTarget({
                                  fromOuId: null,
                                  fromOuType: null,
                                  workerIds: [m.worker_id],
                                })
                              }
                            >
                              Assign…
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={ouDialog}
        onOpenChange={(open) => {
          setOuDialog(open);
          if (!open) setEditingOuId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOuId != null ? "Edit organising unit" : "Organising unit"}</DialogTitle>
            <DialogDescription>
              Define the unit details and choose an optional anchor worker.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={ouForm.name} onChange={(e) => setOuForm({ ...ouForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={ouForm.ou_type}
                onValueChange={(v) => setOuForm({ ...ouForm, ou_type: v as CampaignOuType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OU_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estimated workers in unit</Label>
              <Input
                type="number"
                min={0}
                value={ouForm.total_workers_estimated}
                onChange={(e) => setOuForm({ ...ouForm, total_workers_estimated: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Target size (5-50 typical)</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 15"
                value={ouForm.target_size}
                onChange={(e) => setOuForm({ ...ouForm, target_size: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Commonality logic</Label>
              <Textarea
                value={ouForm.commonality_logic}
                onChange={(e) => setOuForm({ ...ouForm, commonality_logic: e.target.value })}
                placeholder="What makes this group cohesive? e.g. same shift, same work area, same ethnic community"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Anchor worker</Label>
              <Select
                value={ouForm.anchor_worker_id || "__none__"}
                onValueChange={(v) =>
                  setOuForm({ ...ouForm, anchor_worker_id: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {members.map((m: unknown) => {
                    const nw = normalizeMemberWorker(m);
                    if (!nw) return null;
                    return (
                      <SelectItem key={nw.worker_id} value={String(nw.worker_id)}>
                        {workerDisplayName(nw)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOuDialog(false); setEditingOuId(null); }}>
              Cancel
            </Button>
            <Button
              disabled={!ouForm.name || createOu.isPending || updateOu.isPending}
              onClick={() => {
                if (editingOuId != null) {
                  updateOu.mutate(editingOuId);
                } else {
                  createOu.mutate();
                }
              }}
            >
              {editingOuId != null
                ? (updateOu.isPending ? "Saving…" : "Save changes")
                : (createOu.isPending ? "Saving…" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assignDialog}
        onOpenChange={(open) => {
          if (!open) {
            setAssignDialog(null);
            resetAssignDialogState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to {assignDialog?.name}</DialogTitle>
            <DialogDescription>
              Filter and select campaign workers to bulk assign to this unit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <CampaignWorkerAssignmentPicker
              campaignId={campaignId}
              targetOuId={assignDialog?.ou_id ?? null}
              selectedWorkerIds={selectedAssignWorkerIds}
              onSelectedWorkerIdsChange={setSelectedAssignWorkerIds}
              showPrimaryCheckbox
              assignPrimary={assignPrimary}
              onAssignPrimaryChange={setAssignPrimary}
              feedback={assignFeedback}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedAssignWorkerIds(new Set())}
              disabled={selectedCount === 0}
            >
              Clear selection
            </Button>
            <Button
              onClick={() => beginBulkAssign()}
              disabled={selectedCount === 0 || assignOu.isPending}
            >
              {assignOu.isPending ? "Assigning..." : `Assign selected (${selectedCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={conflictDialogOpen} onOpenChange={setConflictDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some workers are already assigned</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConflictCount} selected worker{pendingConflictCount === 1 ? "" : "s"} already belong to this
              unit. Continue and assign only the {pendingNewCount} new worker{pendingNewCount === 1 ? "" : "s"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review selection</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignIgnoringConflicts}>
              Continue with new only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove from unit (single or bulk) */}
      <AlertDialog
        open={removeConfirmState !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveConfirmState(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from unit?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeConfirmState && (
                <>
                  Remove {removeConfirmState.workerIds.length}{" "}
                  {removeConfirmState.workerIds.length === 1 ? "worker" : "workers"} from this
                  unit? They will remain in the campaign and in any other units they belong to.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeConfirmState) {
                  removeFromUnitMutation.mutate({
                    ouId: removeConfirmState.ouId,
                    workerIds: removeConfirmState.workerIds,
                  });
                }
              }}
            >
              {removeFromUnitMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reallocate workers to another same-type unit, or assign from Unallocated */}
      {reallocateTarget && (() => {
        const fromOuType = reallocateTarget.fromOuType;
        const isFromUnallocated = reallocateTarget.fromOuId === null;
        const sourceOu = !isFromUnallocated
          ? ousTyped.find((o) => o.ou_id === reallocateTarget.fromOuId)
          : null;
        const sourceParentId = sourceOu?.parent_ou_id ?? null;
        const isFromSubUnit = sourceParentId != null;
        const candidateOus = (ous as { ou_id: number; name: string; ou_type: string; parent_ou_id?: number | null }[]).filter(
          (o) => {
            if (o.ou_id === reallocateTarget.fromOuId) return false;
            if (isFromUnallocated) return true;
            // If reallocating from a sub-unit, restrict targets to its siblings
            // (same parent_ou_id) so workers stay within the parent OU's roll-up.
            if (isFromSubUnit) {
              return (o.parent_ou_id ?? null) === sourceParentId;
            }
            if (!fromOuType || fromOuType === "custom") return true;
            return o.ou_type === fromOuType;
          }
        );
        const workerCount = reallocateTarget.workerIds.length;
        return (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setReallocateTarget(null);
                setReallocateSelectedOuId("");
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isFromUnallocated ? "Assign to unit" : "Reallocate to another unit"}
                </DialogTitle>
                <DialogDescription>
                  {isFromUnallocated ? (
                    <>
                      Assign {workerCount} {workerCount === 1 ? "worker" : "workers"} to an
                      organising unit.
                    </>
                  ) : (
                    <>
                      Move {workerCount} {workerCount === 1 ? "worker" : "workers"} to a different
                      unit. They will be removed from the current unit.
                      {isFromSubUnit && (
                        <> Only <strong>sibling sub-units</strong> are shown — moves stay
                        within the parent unit&apos;s roll-up.</>
                      )}
                      {!isFromSubUnit && fromOuType && fromOuType !== "custom" && (
                        <> Only <strong>{fromOuType.replace(/_/g, " ")}</strong> units are shown
                        — moves are restricted to the same dimension.</>
                      )}
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                {candidateOus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No{" "}
                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated
                      ? fromOuType.replace(/_/g, " ") + " "
                      : ""}
                    units available.{" "}
                    {fromOuType && fromOuType !== "custom" && !isFromUnallocated && (
                      <>Workers in custom units are unrestricted.</>
                    )}
                  </p>
                ) : (
                  <Select value={reallocateSelectedOuId} onValueChange={setReallocateSelectedOuId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose target unit…" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidateOus.map((o) => (
                        <SelectItem key={o.ou_id} value={String(o.ou_id)}>
                          {o.name || `${o.ou_type?.replace(/_/g, " ")} #${o.ou_id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReallocateTarget(null);
                    setReallocateSelectedOuId("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    !reallocateSelectedOuId ||
                    candidateOus.length === 0 ||
                    reallocateToUnitMutation.isPending
                  }
                  onClick={() => {
                    if (!reallocateSelectedOuId || !reallocateTarget) return;
                    reallocateToUnitMutation.mutate({
                      fromOuId: reallocateTarget.fromOuId,
                      toOuId: Number(reallocateSelectedOuId),
                      workerIds: reallocateTarget.workerIds,
                    });
                  }}
                >
                  {reallocateToUnitMutation.isPending
                    ? (isFromUnallocated ? "Assigning…" : "Moving…")
                    : (isFromUnallocated ? "Assign" : "Reallocate")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Split a unit into sub-units */}
      {splitTargetOu && (
        <SplitUnitDialog
          open={!!splitTargetOu}
          onOpenChange={(o) => {
            if (!o) setSplitTargetOu(null);
          }}
          campaignId={Number(campaignId)}
          parent={splitTargetOu}
          members={splitMembers}
          onSplit={() => {
            queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
            queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou"] });
            setSplitTargetOu(null);
          }}
        />
      )}

      <CreateOrganisingUnitDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        campaignId={campaignId}
        displayOrder={
          ous.length > 0
            ? Math.max(...ous.map((o) => (o.display_order ?? 0) as number)) + 1
            : 0
        }
      />

      {deleteTargetOu && (
        <DeleteOrganisingUnitDialog
          open={!!deleteTargetOu}
          onOpenChange={(o) => {
            if (!o) setDeleteTargetOuId(null);
          }}
          campaignId={campaignId}
          unit={{
            ou_id: deleteTargetOu.ou_id,
            name: deleteTargetOu.name,
            ou_type: deleteTargetOu.ou_type,
            parent_ou_id: deleteTargetOu.parent_ou_id ?? null,
            ou_group_id: (deleteTargetOu as { ou_group_id?: number | null }).ou_group_id ?? null,
            is_group_container:
              (deleteTargetOu as { is_group_container?: boolean }).is_group_container ?? false,
          }}
          allOus={ousTyped.map((o) => ({
            ou_id: o.ou_id,
            name: o.name,
            ou_type: o.ou_type,
            parent_ou_id: o.parent_ou_id ?? null,
            ou_group_id: (o as { ou_group_id?: number | null }).ou_group_id ?? null,
            is_group_container: (o as { is_group_container?: boolean }).is_group_container ?? false,
          }))}
          childOuIds={(childrenByParent.get(deleteTargetOu.ou_id) ?? []).map((c) => c.ou_id)}
          workers={deleteUnitWorkers}
          onDeleted={() => {
            setDeleteTargetOuId(null);
            setUnitSelection(null);
          }}
        />
      )}
    </div>
  );
}
