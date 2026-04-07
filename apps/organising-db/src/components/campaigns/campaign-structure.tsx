"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Pencil, Lightbulb, RefreshCw } from "lucide-react";
import type { CampaignOuType, OaLeaderRole, OuCandidateStatus } from "@/types/database";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import { generateOuCandidatesFromWtp } from "@/lib/campaign/generate-ou-candidates";

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

export function CampaignStructureSection({
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

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id, oa_leader_role,
           worker:workers(
             worker_id, first_name, last_name,
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
          `id, ou_id, worker_id, is_primary,
           ou:campaign_organising_units(ou_id, name),
           worker:workers(worker_id, first_name, last_name)`
        )
        .in("ou_id", ouIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: ous.length > 0,
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

  const acceptCandidate = useMutation({
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

  const rejectCandidate = useMutation({
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

  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

  const generateCandidates = useMutation({
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

  const updateOaRole = useMutation({
    mutationFn: async (vars: { membership_id: number; oa_leader_role: OaLeaderRole | null }) => {
      const { error } = await supabase
        .from("campaign_worker_membership")
        .update({ oa_leader_role: vars.oa_leader_role })
        .eq("membership_id", vars.membership_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
    },
  });

  const createOu = useMutation({
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
      setOuForm({ name: "", ou_type: "department", total_workers_estimated: "", anchor_worker_id: "", commonality_logic: "", target_size: "" });
    },
  });

  const assignOu = useMutation({
    mutationFn: async () => {
      if (!assignDialog || !assignWorkerId) return;
      const { error } = await supabase.from("campaign_worker_ou").insert({
        ou_id: assignDialog.ou_id,
        worker_id: Number(assignWorkerId),
        is_primary: assignPrimary,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      setAssignDialog(null);
      setAssignWorkerId("");
      setAssignPrimary(false);
    },
  });

  const generateJobTypeOus = useMutation({
    mutationFn: async () => {
      const workerIds = members.map((m: { worker_id: number }) => m.worker_id);
      if (workerIds.length === 0) return;
      const { data: ws, error } = await supabase
        .from("workers")
        .select("worker_id, classification")
        .in("worker_id", workerIds);
      if (error) throw error;
      const byClass = new Map<string, number[]>();
      for (const w of ws ?? []) {
        const c = (w.classification || "Unspecified").trim() || "Unspecified";
        if (!byClass.has(c)) byClass.set(c, []);
        byClass.get(c)!.push(w.worker_id);
      }
      for (const [name, ids] of byClass) {
        const { data: ou, error: ouErr } = await supabase
          .from("campaign_organising_units")
          .insert({
            campaign_id: Number(campaignId),
            ou_type: "job_type",
            name,
            total_workers_estimated: ids.length,
            source_metadata: { generated_from: "classification" },
          })
          .select("ou_id")
          .single();
        if (ouErr) throw ouErr;
        const rows = ids.map((worker_id) => ({
          ou_id: ou.ou_id,
          worker_id,
          is_primary: false,
        }));
        const { error: insErr } = await supabase.from("campaign_worker_ou").insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
    },
  });

  const memberRows = useMemo(() => members, [members]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaign workers & OA roles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>OA leader role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground text-sm">
                      No workers in this campaign.
                    </TableCell>
                  </TableRow>
                ) : (
                  memberRows.map((row: unknown) => {
                      const r = row as {
                        membership_id: number;
                        worker_id: number;
                        oa_leader_role: string | null;
                        worker: unknown;
                      };
                      const wr = r.worker;
                      const w = (Array.isArray(wr) ? wr[0] : wr) as {
                        first_name: string;
                        last_name: string;
                        member_role_type: { role_name: string } | { role_name: string }[] | null;
                        union_membership_type:
                          | { type_name: string }
                          | { type_name: string }[]
                          | null;
                      } | null;
                      const mtRaw = w?.member_role_type;
                      const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) as { role_name: string } | null;
                      const umRaw = w?.union_membership_type;
                      const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) as { type_name: string } | null;
                      const delegateOk = isWorkerMemberLike({
                        unionMembershipTypeName: um?.type_name,
                        memberRoleName: mt?.role_name,
                      });
                      return (
                        <TableRow key={r.membership_id}>
                          <TableCell className="font-medium">
                            {w ? `${w.first_name} ${w.last_name}` : r.worker_id}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={r.oa_leader_role ?? "__none__"}
                              onValueChange={(v) => {
                                const role = v === "__none__" ? null : (v as OaLeaderRole);
                                if (role === "delegate" && !delegateOk) return;
                                updateOaRole.mutate({
                                  membership_id: r.membership_id,
                                  oa_leader_role: role,
                                });
                              }}
                              disabled={!canWrite}
                            >
                              <SelectTrigger className="w-44 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                <SelectItem value="contact">Contact</SelectItem>
                                <SelectItem value="activist">Activist</SelectItem>
                                <SelectItem value="delegate" disabled={!delegateOk}>
                                  Delegate (members only)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* OU Coverage Summary */}
      {coverage && coverage.total_ous > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">OU coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
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
                <p className="text-2xl font-bold">
                  {coverage.total_assigned_workers}/{coverage.total_estimated_workers}
                </p>
                <p className="text-xs text-muted-foreground">Workers assigned/est.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggested units from WTP */}
      {candidates.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-lg">
                Suggested units
                <Badge variant="secondary" className="ml-2 text-xs">{candidates.length}</Badge>
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
          <CardTitle className="text-lg">Organising units</CardTitle>
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
                <Button variant="outline" size="sm" onClick={() => generateJobTypeOus.mutate()}>
                  Generate from job type
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
              <div key={ou.ou_id} className="rounded-md border p-3 space-y-2">
                <div className="flex justify-between items-start">
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
                        is_primary: boolean;
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
                        </li>
                      );
                    })}
                </ul>
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
