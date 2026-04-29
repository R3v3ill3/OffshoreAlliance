"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateTaskListDialog } from "./task-lists/create-task-list-dialog";

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

  async function issueToken(taskListId: number) {
    const res = await fetchApi(`/api/campaigns/${campaignId}/task-lists/${taskListId}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: 30 }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    setTokenDialog({ url: json.url, raw: json.token });
  }

  const revokeTokens = useAuthAwareMutation({
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Leader task lists</CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              New task list
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Create a list for a campaign leader. Link an activity if you want ratings to flow to
            it; otherwise the list is standalone. A worker assigned as leader is rated 1 for the
            linked activity and promoted to Activist if currently no role or Contact. Workers on
            the list are added for assessment and are not automatically rated.
          </p>
          {taskLists.length === 0 ? (
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
                          <div className="text-xs text-muted-foreground">
                            {act?.title ?? "Standalone"}
                          </div>
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

      <CreateTaskListDialog
        campaignId={campaignId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <Dialog open={!!tokenDialog} onOpenChange={() => setTokenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leader link (copy now)</DialogTitle>
          </DialogHeader>
          <p className="text-sm break-all font-mono bg-muted p-2 rounded">{tokenDialog?.url}</p>
          <p className="text-xs text-muted-foreground">
            Raw token (for debugging):{" "}
            <span className="font-mono">{tokenDialog?.raw?.slice(0, 12)}…</span>
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
