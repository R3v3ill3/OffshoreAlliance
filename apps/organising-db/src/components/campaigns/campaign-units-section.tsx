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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { CheckCircle2, XCircle, Pencil, Lightbulb, RefreshCw, Trash2 } from "lucide-react";
import type { CampaignOuType, OuCandidateStatus } from "@/types/database";
import { generateOuCandidatesFromWtp } from "@/lib/campaign/generate-ou-candidates";
import { recomputeOuAssignments } from "@/lib/campaign/recompute-ou-assignments";
import {
  getCampaignMembershipStatus,
  type CampaignMembershipStatus,
} from "@/lib/campaign/constants";

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
  const [assignSearch, setAssignSearch] = useState("");
  const [assignEmployerFilter, setAssignEmployerFilter] = useState("__all__");
  const [assignWorksiteFilter, setAssignWorksiteFilter] = useState("__all__");
  const [assignRoleFilter, setAssignRoleFilter] = useState("__all__");
  const [assignMembershipFilter, setAssignMembershipFilter] = useState("__all__");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(true);
  const [assignSortBy, setAssignSortBy] = useState<"name" | "employer" | "worksite" | "role" | "unit_count">("name");
  const [assignSortDir, setAssignSortDir] = useState<"asc" | "desc">("asc");
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

  // Source OU + workers pending reallocation — opens the reallocate dialog.
  const [reallocateTarget, setReallocateTarget] = useState<{
    fromOuId: number;
    fromOuType: string | null;
    workerIds: number[];
  } | null>(null);
  const [reallocateSelectedOuId, setReallocateSelectedOuId] = useState<string>("");

  // Confirm dialog state for single or bulk remove from unit.
  const [removeConfirmState, setRemoveConfirmState] = useState<{
    ouId: number;
    workerIds: number[];
  } | null>(null);

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
      return data ?? [];
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

  const assignEmployerOptions = useMemo(
    () => [...new Set(memberOptions.map((m) => m.employer_name).filter(Boolean))],
    [memberOptions]
  );
  const assignWorksiteOptions = useMemo(
    () => [...new Set(memberOptions.map((m) => m.worksite_name).filter(Boolean))],
    [memberOptions]
  );

  const filteredAssignableWorkers = useMemo(() => {
    const loweredSearch = assignSearch.trim().toLowerCase();
    const rows = memberOptions.filter((m) => {
      if (assignEmployerFilter !== "__all__" && m.employer_name !== assignEmployerFilter) return false;
      if (assignWorksiteFilter !== "__all__" && m.worksite_name !== assignWorksiteFilter) return false;
      if (assignRoleFilter !== "__all__" && m.organising_role !== assignRoleFilter) return false;
      if (assignMembershipFilter !== "__all__" && m.membership_status !== assignMembershipFilter) return false;
      if (showOnlyUnassigned && m.is_already_assigned) return false;
      if (loweredSearch && !m.label.toLowerCase().includes(loweredSearch)) return false;
      return true;
    });

    const sortFactor = assignSortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const safeCompare = (left: string | number, right: string | number) =>
        left < right ? -1 : left > right ? 1 : 0;
      if (assignSortBy === "employer") return safeCompare(a.employer_name, b.employer_name) * sortFactor;
      if (assignSortBy === "worksite") return safeCompare(a.worksite_name, b.worksite_name) * sortFactor;
      if (assignSortBy === "role") return safeCompare(a.organising_role, b.organising_role) * sortFactor;
      if (assignSortBy === "unit_count") return safeCompare(a.unit_count, b.unit_count) * sortFactor;
      return safeCompare(a.label, b.label) * sortFactor;
    });
  }, [
    memberOptions,
    assignEmployerFilter,
    assignWorksiteFilter,
    assignRoleFilter,
    assignMembershipFilter,
    showOnlyUnassigned,
    assignSearch,
    assignSortBy,
    assignSortDir,
  ]);

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
    setAssignSearch("");
    setAssignEmployerFilter("__all__");
    setAssignWorksiteFilter("__all__");
    setAssignRoleFilter("__all__");
    setAssignMembershipFilter("__all__");
    setShowOnlyUnassigned(true);
    setAssignSortBy("name");
    setAssignSortDir("asc");
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
      fromOuId: number;
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

      const { error: delErr } = await supabase
        .from("campaign_worker_ou" as never)
        .delete()
        .eq("ou_id", fromOuId)
        .in("worker_id", workerIds);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setUnitSelection(null);
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

  const selectedCount = selectedAssignWorkerIds.size;
  const allFilteredSelected =
    filteredAssignableWorkers.length > 0 &&
    filteredAssignableWorkers.every((w) => selectedAssignWorkerIds.has(w.worker_id));
  const selectedAlreadyAssignedCount = useMemo(
    () => [...selectedAssignWorkerIds].filter((id) => assignTargetAssignedWorkerIds.has(id)).length,
    [selectedAssignWorkerIds, assignTargetAssignedWorkerIds]
  );
  const selectedNewCount = selectedCount - selectedAlreadyAssignedCount;

  const toggleSelectFiltered = () => {
    setSelectedAssignWorkerIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredAssignableWorkers.forEach((w) => next.delete(w.worker_id));
      } else {
        filteredAssignableWorkers.forEach((w) => next.add(w.worker_id));
      }
      return next;
    });
  };

  const toggleSelectOne = (workerId: number) => {
    setSelectedAssignWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

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
            ous.map((ou: {
              ou_id: number;
              name: string;
              ou_type: string;
              total_workers_estimated: number | null;
              commonality_logic?: string | null;
              source?: string | null;
            }) => (
              <div key={ou.ou_id} className="rounded-md border p-3 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium">{ou.name}</p>
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
                                worker: unknown;
                              };
                              const wr = row.worker;
                              const w = (Array.isArray(wr) ? wr[0] : wr) as {
                                first_name: string;
                                last_name: string;
                              } | null;
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
                                        aria-label={`Select ${w ? `${w.first_name} ${w.last_name}` : "worker"}`}
                                      />
                                    </td>
                                  )}
                                  <td className="px-1 py-1">
                                    {w ? `${w.first_name} ${w.last_name}` : "—"}
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
                          {r.value_text ?? r.value_int ?? "—"}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {canWrite && (
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

                      <Input
                        className="h-8"
                        placeholder="value (text or id)"
                        value={ruleFormByOu[ou.ou_id]?.value ?? ""}
                        onChange={(e) =>
                          setRuleFormByOu((prev) => ({
                            ...prev,
                            [ou.ou_id]: {
                              include: prev[ou.ou_id]?.include ?? true,
                              dimension_type: prev[ou.ou_id]?.dimension_type ?? "occupation",
                              operator: prev[ou.ou_id]?.operator ?? "contains",
                              value: e.target.value,
                            },
                          }))
                        }
                      />

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
              </div>
            ))
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <Input
                placeholder="Search workers..."
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
              <Select value={assignEmployerFilter} onValueChange={setAssignEmployerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Employer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All employers</SelectItem>
                  {assignEmployerOptions.map((employer) => (
                    <SelectItem key={employer} value={employer}>
                      {employer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignWorksiteFilter} onValueChange={setAssignWorksiteFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Worksite" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All worksites</SelectItem>
                  {assignWorksiteOptions.map((worksite) => (
                    <SelectItem key={worksite} value={worksite}>
                      {worksite}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignRoleFilter} onValueChange={setAssignRoleFilter}>
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
              <Select value={assignMembershipFilter} onValueChange={setAssignMembershipFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Membership" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All membership</SelectItem>
                  <SelectItem value="member">Members</SelectItem>
                  <SelectItem value="member_pending">Member – pending</SelectItem>
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
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={assignPrimary}
                    onCheckedChange={(checked) => setAssignPrimary(checked === true)}
                    disabled={selectedCount > 1}
                  />
                  Set as primary (single worker only)
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort</span>
                <Select value={assignSortBy} onValueChange={(v) => setAssignSortBy(v as typeof assignSortBy)}>
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
                <Select value={assignSortDir} onValueChange={(v) => setAssignSortDir(v as typeof assignSortDir)}>
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

            <div className="rounded-md border max-h-80 overflow-auto">
              <div className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{selectedCount} selected</Badge>
                  <Badge variant="outline">{filteredAssignableWorkers.length} in view</Badge>
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
                        onCheckedChange={() => toggleSelectFiltered()}
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
                  ) : filteredAssignableWorkers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-sm text-muted-foreground text-center py-6">
                        No workers match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAssignableWorkers.map((worker) => (
                      <TableRow key={worker.worker_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedAssignWorkerIds.has(worker.worker_id)}
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

            {assignFeedback && (
              <p className="text-xs text-muted-foreground">{assignFeedback}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedCount} selected • {selectedAlreadyAssignedCount} already assigned • {selectedNewCount} new
            </p>
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

      {/* Reallocate workers to another same-type unit */}
      {reallocateTarget && (() => {
        const fromOuType = reallocateTarget.fromOuType;
        const candidateOus = (ous as { ou_id: number; name: string; ou_type: string }[]).filter(
          (o) => {
            if (o.ou_id === reallocateTarget.fromOuId) return false;
            if (!fromOuType || fromOuType === "custom") return true;
            return o.ou_type === fromOuType;
          }
        );
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
                <DialogTitle>Reallocate to another unit</DialogTitle>
                <DialogDescription>
                  Move {reallocateTarget.workerIds.length}{" "}
                  {reallocateTarget.workerIds.length === 1 ? "worker" : "workers"} to a different
                  unit. They will be removed from the current unit.
                  {fromOuType && fromOuType !== "custom" && (
                    <> Only <strong>{fromOuType.replace(/_/g, " ")}</strong> units are shown
                    — moves are restricted to the same dimension.</>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                {candidateOus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No other{" "}
                    {fromOuType && fromOuType !== "custom"
                      ? fromOuType.replace(/_/g, " ") + " "
                      : ""}
                    units to move to.{" "}
                    {fromOuType && fromOuType !== "custom" && (
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
                  {reallocateToUnitMutation.isPending ? "Moving…" : "Reallocate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
