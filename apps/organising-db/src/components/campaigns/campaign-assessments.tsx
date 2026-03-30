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
import { Textarea } from "@/components/ui/textarea";
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
import { ACTIVITY_TEMPLATE_OPTIONS, VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import type { CampaignActivity, CampaignActivityTemplateKey } from "@/types/database";

export function CampaignAssessmentsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<string>("__custom__");
  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_kind: "task" as "task" | "assessment",
    is_binary: false,
    supporter_outcome_value: "" as string,
  });
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);

  const { data: activities = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignActivity[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `membership_id, worker_id, oa_leader_role,
           worker:workers(worker_id, first_name, last_name)`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ratingSummary = [] } = useQuery({
    queryKey: ["campaign-rating-summary", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_worker_rating_summary").select("*").eq(
        "campaign_id",
        campaignId
      );
      if (error) throw error;
      return data ?? [];
    },
  });

  const activityForRates = selectedActivityId ?? activities[0]?.activity_id ?? null;

  const { data: ratingsForActivity = [] } = useQuery({
    queryKey: ["campaign-activity-ratings", activityForRates],
    queryFn: async () => {
      if (!activityForRates) return [];
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select("*")
        .eq("activity_id", activityForRates);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activityForRates,
  });

  const createActivity = useMutation({
    mutationFn: async () => {
      const templateKey =
        templateChoice !== "__custom__" ? (templateChoice as CampaignActivityTemplateKey) : null;
      const fromTemplate = ACTIVITY_TEMPLATE_OPTIONS.find((t) => t.key === templateKey);
      const is_binary =
        fromTemplate?.defaultBinary ?? (templateKey === "vote" ? true : form.is_binary);
      const payload: Record<string, unknown> = {
        campaign_id: Number(campaignId),
        title: form.title || fromTemplate?.label || "Activity",
        activity_kind: form.activity_kind,
        is_binary,
        is_custom: templateChoice === "__custom__",
        template_key: templateKey,
      };
      if (form.description) payload.description = form.description;
      if (is_binary && form.supporter_outcome_value) {
        payload.supporter_outcome_value = form.supporter_outcome_value;
      } else if (is_binary && templateKey === "vote") {
        payload.supporter_outcome_value = "yes";
      }
      const { error } = await supabase.from("campaign_activities").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
      setDialogOpen(false);
      setForm({
        title: "",
        description: "",
        activity_kind: "task",
        is_binary: false,
        supporter_outcome_value: "",
      });
      setTemplateChoice("__custom__");
    },
  });

  const saveRating = useMutation({
    mutationFn: async (vars: {
      activity_id: number;
      worker_id: number;
      rating: number;
      binary_value?: string | null;
    }) => {
      const { error } = await supabase.from("campaign_activity_ratings").upsert(
        {
          activity_id: vars.activity_id,
          worker_id: vars.worker_id,
          rating: vars.rating,
          binary_value: vars.binary_value ?? null,
          source: "staff",
          rated_at: new Date().toISOString(),
        },
        { onConflict: "activity_id,worker_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
    },
  });

  const summaryMap = new Map(
    ratingSummary.map((r: { worker_id: number; cumulative_rating: number | null; last_activity_rating: number | null }) => [
      r.worker_id,
      r,
    ])
  );

  const ratingMap = new Map(
    ratingsForActivity.map((r: { worker_id: number; rating: number; binary_value: string | null }) => [
      r.worker_id,
      r,
    ])
  );

  const selectedActivity = activities.find((a) => a.activity_id === activityForRates);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Tasks & assessments</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              Add activity
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activities yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {activities.map((a) => (
                <Button
                  key={a.activity_id}
                  variant={a.activity_id === activityForRates ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedActivityId(a.activity_id);
                  }}
                >
                  {a.title}
                  {a.template_key && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {a.template_key}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>
          )}

          {activityForRates && members.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Rating (1–5)</TableHead>
                    {selectedActivity?.is_binary && <TableHead>Response</TableHead>}
                    <TableHead>Cumulative</TableHead>
                    <TableHead>Last</TableHead>
                    {canWrite && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((row: { worker_id: number; worker: unknown }) => {
                    const wr = row.worker;
                    const w = (Array.isArray(wr) ? wr[0] : wr) as {
                      first_name: string;
                      last_name: string;
                    } | null;
                    const existing = ratingMap.get(row.worker_id);
                    const sum = summaryMap.get(row.worker_id);
                    return (
                      <TableRow key={row.worker_id}>
                        <TableCell className="font-medium">
                          {w ? `${w.first_name} ${w.last_name}` : row.worker_id}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={existing ? String(existing.rating) : ""}
                            onValueChange={(v) =>
                              saveRating.mutate({
                                activity_id: activityForRates,
                                worker_id: row.worker_id,
                                rating: Number(v),
                                binary_value: existing?.binary_value ?? null,
                              })
                            }
                            disabled={!canWrite}
                          >
                            <SelectTrigger className="w-24 h-8">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {selectedActivity?.is_binary && (
                          <TableCell>
                            <Select
                              value={existing?.binary_value ?? ""}
                              onValueChange={(v) =>
                                saveRating.mutate({
                                  activity_id: activityForRates,
                                  worker_id: row.worker_id,
                                  rating: existing?.rating ?? 3,
                                  binary_value: v,
                                })
                              }
                              disabled={!canWrite}
                            >
                              <SelectTrigger className="w-28 h-8">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {VOTE_SUPPORTER_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        <TableCell>{sum?.cumulative_rating ?? "—"}</TableCell>
                        <TableCell>{sum?.last_activity_rating ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add activity</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label>From template</Label>
              <Select value={templateChoice} onValueChange={setTemplateChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__custom__">Custom</SelectItem>
                  {ACTIVITY_TEMPLATE_OPTIONS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Overrides template label if set"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Kind</Label>
                <Select
                  value={form.activity_kind}
                  onValueChange={(v) => setForm({ ...form, activity_kind: v as "task" | "assessment" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="assessment">Assessment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {templateChoice === "__custom__" && (
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_binary}
                      onChange={(e) => setForm({ ...form, is_binary: e.target.checked })}
                    />
                    Binary / vote-style
                  </label>
                </div>
              )}
            </div>
            {(form.is_binary || templateChoice === "vote") && (
              <div className="space-y-2">
                <Label>Supporter outcome (for binary)</Label>
                <Select
                  value={form.supporter_outcome_value || "yes"}
                  onValueChange={(v) => setForm({ ...form, supporter_outcome_value: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOTE_SUPPORTER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createActivity.mutate()}
              disabled={
                createActivity.isPending ||
                (templateChoice === "__custom__" && !form.title.trim())
              }
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
