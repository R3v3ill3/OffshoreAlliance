"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Pencil, Lightbulb, RefreshCw } from "lucide-react";
import type { CampaignOuType, OuCandidateStatus } from "@/types/database";
import { generateOuCandidatesFromWtp } from "@/lib/campaign/generate-ou-candidates";
import { recomputeOuAssignments } from "@/lib/campaign/recompute-ou-assignments";

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

function normalizeMemberWorker(m: unknown): {
  worker_id: number;
  first_name: string;
  last_name: string;
} | null {
  const row = m as { worker_id: number; worker: unknown };
  const wr = row.worker;
  const w = (Array.isArray(wr) ? wr[0] : wr) as { first_name: string; last_name: string } | null;
  if (!w) return null;
  return { worker_id: row.worker_id, ...w };
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
  const [ouForm, setOuForm] = useState({
    name: "",
    ou_type: "department" as CampaignOuType,
    total_workers_estimated: "",
    anchor_worker_id: "" as string,
    commonality_logic: "",
    target_size: "",
  });
  const [assignDialog, setAssignDialog] = useState<{ ou_id: number; name: string } | null>(null);
  const [assignWorkerId, setAssignWorkerId] = useState("");
  const [assignPrimary, setAssignPrimary] = useState(false);
  const [ruleFormByOu, setRuleFormByOu] = useState<
    Record<number, { include: boolean; dimension_type: string; operator: string; value: string }>
  >({});
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id,
           worker:workers(worker_id, first_name, last_name)`
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
        .order("name");
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

  const acceptCandidate = useAuthAwareMutation({
    mutationFn: async (c: {
      candidate_id: number;
      suggested_name: string;
      suggested_ou_type: string;
      estimated_workers: number | null;
      commonality_logic: string | null;
    }) => {
      const { data: ou, error: ouErr } = await supabase
        .from("campaign_organising_units")
        .insert({
          campaign_id: Number(campaignId),
          name: c.suggested_name,
          ou_type: c.suggested_ou_type,
          total_workers_estimated: c.estimated_workers,
          commonality_logic: c.commonality_logic,
          source: "wtp_seeded",
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
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        name: ouForm.name,
        ou_type: ouForm.ou_type,
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

  const assignOu = useAuthAwareMutation({
    mutationFn: async () => {
      if (!assignDialog || !assignWorkerId) return;
      const { error } = await (supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
        };
      })
        .from("campaign_worker_ou")
        .insert({
          ou_id: assignDialog.ou_id,
          worker_id: Number(assignWorkerId),
          is_primary: assignPrimary,
          assignment_source: "manual",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      setAssignDialog(null);
      setAssignWorkerId("");
      setAssignPrimary(false);
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

  const rulesByOu = useMemo(() => {
    const map: Record<number, UnitRule[]> = {};
    for (const r of rules) {
      if (!map[r.ou_id]) map[r.ou_id] = [];
      map[r.ou_id].push(r);
    }
    return map;
  }, [rules]);

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
                    {c.suggested_ou_type.replace(/_/g, " ")}
                    {c.estimated_workers != null && ` · est. ${c.estimated_workers} workers`}
                    {` · source: ${c.source.replace(/_/g, " ")}`}
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
                      title="Edit & accept"
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
                      {ou.ou_type.replace(/_/g, " ")}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAssignDialog({ ou_id: ou.ou_id, name: ou.name })}
                    >
                      Assign worker
                    </Button>
                  )}
                </div>

                <ul className="text-sm text-muted-foreground list-disc pl-4">
                  {ouAssignments
                    .filter((a: { ou_id: number }) => a.ou_id === ou.ou_id)
                    .map((a: unknown) => {
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
                      return (
                        <li key={row.id}>
                          {w ? `${w.first_name} ${w.last_name}` : "—"}
                          {row.is_primary ? " (primary)" : ""}
                          {row.assignment_source === "rule" ? " [rule]" : ""}
                          {multiUnitWorkerIds.has(row.worker_id) ? " [multi-unit]" : ""}
                        </li>
                      );
                    })}
                </ul>

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

      <Dialog open={ouDialog} onOpenChange={setOuDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organising unit</DialogTitle>
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
                        {nw.first_name} {nw.last_name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOuDialog(false)}>
              Cancel
            </Button>
            <Button
              disabled={!ouForm.name || createOu.isPending}
              onClick={() => createOu.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to {assignDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Label>Worker</Label>
            <Select value={assignWorkerId} onValueChange={setAssignWorkerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m: unknown) => {
                  const nw = normalizeMemberWorker(m);
                  if (!nw) return null;
                  return (
                    <SelectItem key={nw.worker_id} value={String(nw.worker_id)}>
                      {nw.first_name} {nw.last_name}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignPrimary}
                onChange={(e) => setAssignPrimary(e.target.checked)}
              />
              Primary OU for wall chart
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => assignOu.mutate()}
              disabled={!assignWorkerId || assignOu.isPending}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
