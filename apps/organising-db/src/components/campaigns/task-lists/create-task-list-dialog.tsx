"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { resolveCampaignOrganiserId } from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";

export type CreateTaskListLeaderLock = {
  workerId: number;
  workerName: string;
};

export type CreateTaskListDialogProps = {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the leader picker is hidden and leader_worker_id is forced. */
  leaderWorkerLock?: CreateTaskListLeaderLock;
  onCreated?: (taskListId: number, leaderWorkerId: number | null) => void;
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

const NONE = "__none__";
const STANDALONE = "__standalone__";

export function CreateTaskListDialog({
  campaignId,
  open,
  onOpenChange,
  leaderWorkerLock,
  onCreated,
}: CreateTaskListDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const [organiserFieldKey, setOrganiserFieldKey] = useState(0);
  const [form, setForm] = useState({
    activity_id: "",
    leader_worker_id: "",
    leader_organiser_pick: "",
    title: "",
    worker_ids: [] as number[],
    populate_from_ou: "",
    create_ou_from_list: false,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId],
    enabled: open,
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
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(`worker_id, worker:workers(worker_id, first_name, last_name)`)
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, ou_type")
        .eq("campaign_id", campaignId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const ouIds = useMemo(
    () => ous.map((o: { ou_id: number }) => o.ou_id),
    [ous]
  );

  const { data: ouWorkers = [] } = useQuery({
    queryKey: ["campaign-ou-workers", campaignId, ouIds.join(",")],
    enabled: open && ouIds.length > 0,
    queryFn: async () => {
      if (ouIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id")
        .in("ou_id", ouIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  function populateFromOu(ouId: string) {
    if (ouId === NONE) {
      setForm((f) => ({ ...f, populate_from_ou: "", worker_ids: [] }));
      return;
    }
    const workerIds = ouWorkers
      .filter((ow: { ou_id: number }) => ow.ou_id === Number(ouId))
      .map((ow: { worker_id: number }) => ow.worker_id);
    setForm((f) => ({ ...f, populate_from_ou: ouId, worker_ids: workerIds }));
  }

  function toggleWorker(id: number) {
    setForm((f) => ({
      ...f,
      worker_ids: f.worker_ids.includes(id)
        ? f.worker_ids.filter((x) => x !== id)
        : [...f.worker_ids, id],
    }));
  }

  function resetForm() {
    setForm({
      activity_id: "",
      leader_worker_id: "",
      leader_organiser_pick: "",
      title: "",
      worker_ids: [],
      populate_from_ou: "",
      create_ou_from_list: false,
    });
  }

  const createList = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");

      const activity_id =
        form.activity_id && form.activity_id !== STANDALONE ? Number(form.activity_id) : null;
      const leader_worker_id = leaderWorkerLock
        ? leaderWorkerLock.workerId
        : form.leader_worker_id
        ? Number(form.leader_worker_id)
        : null;
      let leader_organiser_id: number | null = null;
      if (
        !leader_worker_id &&
        form.leader_organiser_pick &&
        form.leader_organiser_pick !== NONE
      ) {
        leader_organiser_id = await resolveCampaignOrganiserId(
          supabase,
          form.leader_organiser_pick,
          { currentUserId: user.id, isAdmin }
        );
      }
      if (!leader_worker_id && leader_organiser_id == null) {
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
      const task_list_id = (tl as { task_list_id: number }).task_list_id;
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

      if (form.create_ou_from_list && form.worker_ids.length > 0 && !form.populate_from_ou) {
        const ouName = form.title || `Task list ${task_list_id}`;
        const { data: newOu, error: ouErr } = await supabase
          .from("campaign_organising_units")
          .insert({
            campaign_id: Number(campaignId),
            ou_type: "custom",
            name: ouName,
            source: "manual",
            anchor_worker_id: leader_worker_id,
          })
          .select("ou_id")
          .single();
        if (!ouErr && newOu) {
          await supabase.from("campaign_worker_ou").insert(
            form.worker_ids.map((wid) => ({
              ou_id: (newOu as { ou_id: number }).ou_id,
              worker_id: wid,
              is_primary: wid === leader_worker_id,
              assignment_source: "manual",
            }))
          );
        }
      }

      return { task_list_id, leader_worker_id };
    },
    onSuccess: ({ task_list_id, leader_worker_id }) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-ous", campaignId] });
      if (leader_worker_id != null) {
        queryClient.invalidateQueries({
          queryKey: ["campaign-task-lists", campaignId, "for-leader", leader_worker_id],
        });
      }
      toast.success("Task list created");
      onOpenChange(false);
      resetForm();
      onCreated?.(task_list_id, leader_worker_id);
    },
    onError: (err) => {
      toast.error(`Failed to create task list: ${(err as Error).message}`);
    },
  });

  const canSubmit =
    !!leaderWorkerLock ||
    !!form.leader_worker_id ||
    (form.leader_organiser_pick && form.leader_organiser_pick !== NONE);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setOrganiserFieldKey((k) => k + 1);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {leaderWorkerLock
              ? `New task list for ${leaderWorkerLock.workerName}`
              : "New task list"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>Linked activity (optional)</Label>
            <Select
              value={form.activity_id || STANDALONE}
              onValueChange={(v) =>
                setForm({ ...form, activity_id: v === STANDALONE ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STANDALONE}>None — standalone task</SelectItem>
                {activities.map((a: { activity_id: number; title: string }) => (
                  <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Link an activity if you want ratings to flow to it when the leader works the list.
            </p>
          </div>

          {!leaderWorkerLock && (
            <div className="space-y-2">
              <Label>Leader worker (optional if organiser set)</Label>
              <Select
                value={form.leader_worker_id || NONE}
                onValueChange={(v) =>
                  setForm({ ...form, leader_worker_id: v === NONE ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
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
          )}

          {!leaderWorkerLock && (
            <CampaignOrganiserSelect
              key={organiserFieldKey}
              resetKey={organiserFieldKey}
              label="Leader organiser (optional if worker set)"
              value={form.leader_organiser_pick}
              onChange={(v) =>
                setForm({ ...form, leader_organiser_pick: v === NONE ? "" : v })
              }
              allowNone
              autoDefaultToCurrentUser={false}
              showStaffHint={false}
            />
          )}

          <div className="space-y-2">
            <Label>List title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={
                leaderWorkerLock
                  ? `${leaderWorkerLock.workerName}'s list`
                  : "Optional"
              }
            />
          </div>

          {ous.length > 0 && (
            <div className="space-y-2">
              <Label>Populate from organising unit</Label>
              <Select
                value={form.populate_from_ou || NONE}
                onValueChange={populateFromOu}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an OU (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Manual selection</SelectItem>
                  {ous.map((ou: { ou_id: number; name: string; ou_type: string }) => (
                    <SelectItem key={ou.ou_id} value={String(ou.ou_id)}>
                      {ou.name}
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {ou.ou_type}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pre-populates the worker list from the selected OU. You can still add or remove
                workers below.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>
              Workers on list
              {form.worker_ids.length > 0 && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({form.worker_ids.length} selected)
                </span>
              )}
            </Label>
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

          {!form.populate_from_ou && form.worker_ids.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.create_ou_from_list}
                onChange={(e) =>
                  setForm({ ...form, create_ou_from_list: e.target.checked })
                }
              />
              Also create an organising unit from these workers
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createList.mutate()}
            disabled={!canSubmit || createList.isPending}
          >
            {createList.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
