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
import type { CampaignOuType, OaLeaderRole } from "@/types/database";
import { MEMBER_ELIGIBLE_ROLE_NAMES } from "@/lib/campaign/constants";

const OU_TYPES: CampaignOuType[] = [
  "shift",
  "department",
  "network",
  "job_type",
  "worksite",
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
             member_role_type:member_role_types(role_name)
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
      const { error } = await supabase.from("campaign_organising_units").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      setOuDialog(false);
      setOuForm({ name: "", ou_type: "department", total_workers_estimated: "", anchor_worker_id: "" });
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
                      } | null;
                      const mtRaw = w?.member_role_type;
                      const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) as { role_name: string } | null;
                      const delegateOk =
                        mt != null && MEMBER_ELIGIBLE_ROLE_NAMES.has(mt.role_name);
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Organising units</CardTitle>
          <div className="flex gap-2">
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={() => generateJobTypeOus.mutate()}>
                  Generate from job type
                </Button>
                <Button size="sm" onClick={() => setOuDialog(true)}>
                  Add unit
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ous.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organising units.</p>
          ) : (
            ous.map((ou: { ou_id: number; name: string; ou_type: string; total_workers_estimated: number | null }) => (
              <div key={ou.ou_id} className="rounded-md border p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{ou.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ou.ou_type.replace(/_/g, " ")}
                      {ou.total_workers_estimated != null && ` · est. ${ou.total_workers_estimated}`}
                    </p>
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
              <Label>Anchor worker (network units)</Label>
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
