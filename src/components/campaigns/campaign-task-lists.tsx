"use client";

import { useState } from "react";
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

export function CampaignTaskListsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tokenDialog, setTokenDialog] = useState<{ url: string; raw: string } | null>(null);
  const [form, setForm] = useState({
    activity_id: "",
    leader_worker_id: "",
    leader_organiser_id: "",
    title: "",
    worker_ids: [] as number[],
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id, title")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(`worker_id, worker:workers(worker_id, first_name, last_name)`)
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: organisers = [] } = useQuery({
    queryKey: ["organisers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organisers")
        .select("organiser_id, organiser_name")
        .eq("is_active", true)
        .order("organiser_name");
      return data ?? [];
    },
  });

  const { data: taskLists = [] } = useQuery({
    queryKey: ["campaign-task-lists", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_task_lists")
        .select(
          `task_list_id, title, status, activity_id, leader_worker_id, leader_organiser_id,
           activity:campaign_activities(title)`
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prospective = [] } = useQuery({
    queryKey: ["campaign-prospective", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_prospective_workers")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createList = useMutation({
    mutationFn: async () => {
      const activity_id = Number(form.activity_id);
      const leader_worker_id = form.leader_worker_id ? Number(form.leader_worker_id) : null;
      const leader_organiser_id = form.leader_organiser_id ? Number(form.leader_organiser_id) : null;
      if (!leader_worker_id && !leader_organiser_id) {
        throw new Error("Choose a leader worker or organiser");
      }
      const { data: tl, error } = await supabase
        .from("campaign_task_lists")
        .insert({
          campaign_id: Number(campaignId),
          activity_id,
          leader_worker_id,
          leader_organiser_id,
          title: form.title || null,
          status: "active",
        })
        .select("task_list_id")
        .single();
      if (error) throw error;
      const task_list_id = tl.task_list_id as number;
      if (form.worker_ids.length > 0) {
        const { error: iErr } = await supabase.from("campaign_task_list_items").insert(
          form.worker_ids.map((worker_id, i) => ({
            task_list_id,
            worker_id,
            sort_order: i,
          }))
        );
        if (iErr) throw iErr;
      }
      return task_list_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
      setDialogOpen(false);
      setForm({
        activity_id: "",
        leader_worker_id: "",
        leader_organiser_id: "",
        title: "",
        worker_ids: [],
      });
    },
  });

  async function issueToken(taskListId: number) {
    const res = await fetch(`/api/campaigns/${campaignId}/task-lists/${taskListId}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: 30 }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    setTokenDialog({ url: json.url, raw: json.token });
  }

  const revokeTokens = useMutation({
    mutationFn: async (taskListId: number) => {
      const { error } = await supabase
        .from("campaign_leader_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("task_list_id", taskListId)
        .is("revoked_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
    },
  });

  function toggleWorker(id: number) {
    setForm((f) => ({
      ...f,
      worker_ids: f.worker_ids.includes(id) ? f.worker_ids.filter((x) => x !== id) : [...f.worker_ids, id],
    }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Leader task lists</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setDialogOpen(true)} disabled={activities.length === 0}>
              New task list
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create an activity under Assessments first.</p>
          ) : taskLists.length === 0 ? (
            <p className="text-sm text-muted-foreground">No task lists yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title / activity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskLists.map((tl: unknown) => {
                    const row = tl as {
                      task_list_id: number;
                      title: string | null;
                      status: string;
                      activity: unknown;
                    };
                    const ar = row.activity;
                    const act = (Array.isArray(ar) ? ar[0] : ar) as { title: string } | null;
                    return (
                      <TableRow key={row.task_list_id}>
                        <TableCell>
                          <div className="font-medium">{row.title || "Untitled"}</div>
                          <div className="text-xs text-muted-foreground">{act?.title}</div>
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right space-x-2">
                          {canWrite && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => issueToken(row.task_list_id)}
                              >
                                Generate link
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeTokens.mutate(row.task_list_id)}
                              >
                                Revoke links
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {prospective.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prospective workers (from leader forms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospective.map(
                    (p: {
                      prospective_id: number;
                      first_name: string;
                      last_name: string;
                      email: string | null;
                      phone: string | null;
                      rating: number | null;
                    }) => (
                      <TableRow key={p.prospective_id}>
                        <TableCell>
                          {p.first_name} {p.last_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.email || p.phone || "—"}
                        </TableCell>
                        <TableCell>{p.rating ?? "—"}</TableCell>
                      </TableRow>
                    )
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Promote to a full worker record from the Workers page if needed.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>New task list</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>Activity</Label>
              <Select value={form.activity_id} onValueChange={(v) => setForm({ ...form, activity_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {activities.map((a: { activity_id: number; title: string }) => (
                    <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                      {a.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leader worker (optional if organiser set)</Label>
              <Select
                value={form.leader_worker_id || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, leader_worker_id: v === "__none__" ? "" : v })
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
            <div className="space-y-2">
              <Label>Leader organiser (optional if worker set)</Label>
              <Select
                value={form.leader_organiser_id || "__none__"}
                onValueChange={(v) =>
                  setForm({ ...form, leader_organiser_id: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {organisers.map((o: { organiser_id: number; organiser_name: string }) => (
                    <SelectItem key={o.organiser_id} value={String(o.organiser_id)}>
                      {o.organiser_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>List title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Workers on list</Label>
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {members.map((m: unknown) => {
                  const nw = normalizeMemberWorker(m);
                  if (!nw) return null;
                  return (
                    <label key={nw.worker_id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.worker_ids.includes(nw.worker_id)}
                        onChange={() => toggleWorker(nw.worker_id)}
                      />
                      {nw.first_name} {nw.last_name}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createList.mutate()}
              disabled={
                !form.activity_id ||
                (!form.leader_worker_id && !form.leader_organiser_id) ||
                createList.isPending
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tokenDialog} onOpenChange={() => setTokenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leader link (copy now)</DialogTitle>
          </DialogHeader>
          <p className="text-sm break-all font-mono bg-muted p-2 rounded">{tokenDialog?.url}</p>
          <p className="text-xs text-muted-foreground">
            Raw token (for debugging): <span className="font-mono">{tokenDialog?.raw?.slice(0, 12)}…</span>
          </p>
          <DialogFooter>
            <Button
              onClick={() => {
                if (tokenDialog?.url) void navigator.clipboard.writeText(tokenDialog.url);
              }}
            >
              Copy URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
