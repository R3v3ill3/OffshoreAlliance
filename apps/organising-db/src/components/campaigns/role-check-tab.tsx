"use client";

/**
 * Role Check tab — post-Phase-6 remediation.
 *
 * Lists campaign workers who have at least one rating of 1
 * (supportive_leader) but whose global union role is NULL or not in
 * (contact / activist / delegate). Reviewers pick a role with a single
 * click; the chosen role_type_id is written to workers.member_role_type_id
 * via the existing /api/workers/batch-update endpoint.
 *
 * Public exports:
 *   - <RoleCheckTab campaignId={…} canWrite={…} />
 *   - useRoleCheckCount(campaignId) — small hook reused by the tab badge.
 *
 * Both share React-Query keys so the count badge stays in sync after
 * every role update:
 *   - ["campaign-role-check", campaignId]
 */

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { ShieldQuestion } from "lucide-react";
import { toast } from "sonner";

interface RoleCheckRow {
  worker_id: number;
  first_name: string | null;
  last_name: string | null;
  occupation: string | null;
  current_role_type_id: number | null;
  latest_activity_id: number;
  latest_activity_title: string;
  latest_rated_at: string;
  rating_1_count: number;
}

interface RoleCheckResponse {
  ok: boolean;
  rows: RoleCheckRow[];
  leader_role_ids: number[];
  leader_role_lookup: {
    contact: number | null;
    activist: number | null;
    delegate: number | null;
  };
}

const queryKey = (campaignId: number) => ["campaign-role-check", String(campaignId)] as const;

async function fetchRoleCheck(campaignId: number): Promise<RoleCheckResponse> {
  const res = await fetchApi(`/api/campaigns/${campaignId}/role-check`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load role-check queue");
  }
  return (await res.json()) as RoleCheckResponse;
}

export function useRoleCheckCount(campaignId: number) {
  return useQuery({
    queryKey: queryKey(campaignId),
    queryFn: () => fetchRoleCheck(campaignId),
    staleTime: 30_000,
    select: (data) => data.rows.length,
  });
}

export function RoleCheckTab({
  campaignId,
  canWrite,
}: {
  campaignId: number;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKey(campaignId),
    queryFn: () => fetchRoleCheck(campaignId),
    staleTime: 30_000,
  });

  const setRole = useAuthAwareMutation({
    mutationFn: async ({ workerId, roleTypeId }: { workerId: number; roleTypeId: number }) => {
      const res = await fetchApi("/api/workers/batch-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_ids: [workerId],
          updates: { member_role_type_id: roleTypeId },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok || body.success === false) {
        throw new Error(body.error ?? "Failed to set role");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKey(campaignId) });
      toast.success("Role updated");
    },
    onError: (err) => {
      toast.error((err as Error).message);
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const lookup = data?.leader_role_lookup;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <EurekaLoadingSpinner />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <ShieldQuestion className="mx-auto mb-3 h-10 w-10 opacity-50" />
          <p>No workers awaiting role confirmation.</p>
          <p className="mt-1 text-xs">
            When a worker is rated 1 (supportive leader) on any campaign assessment
            and their union role is unset, they appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldQuestion className="h-4 w-4" />
          Role check ({rows.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          These workers were rated 1 (supportive leader) on a campaign assessment
          but have no union role set. Confirm the role to clear them from this
          queue. The chosen role applies globally — it persists across campaigns.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Worker</TableHead>
              <TableHead>Latest assessment</TableHead>
              <TableHead>Times rated 1</TableHead>
              <TableHead>Last rated</TableHead>
              <TableHead className="text-right">Set role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.worker_id}>
                <TableCell className="font-medium">
                  {r.first_name ?? ""} {r.last_name ?? ""}
                  {r.occupation ? (
                    <span className="block text-xs text-muted-foreground">
                      {r.occupation}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">
                  {r.latest_activity_title || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.rating_1_count}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(r.latest_rated_at), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {lookup?.contact != null && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canWrite || setRole.isPending}
                      onClick={() =>
                        setRole.mutate({
                          workerId: r.worker_id,
                          roleTypeId: lookup.contact!,
                        })
                      }
                    >
                      Contact
                    </Button>
                  )}
                  {lookup?.activist != null && (
                    <Button
                      size="sm"
                      disabled={!canWrite || setRole.isPending}
                      onClick={() =>
                        setRole.mutate({
                          workerId: r.worker_id,
                          roleTypeId: lookup.activist!,
                        })
                      }
                    >
                      Activist
                    </Button>
                  )}
                  {lookup?.delegate != null && (
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!canWrite || setRole.isPending}
                      onClick={() =>
                        setRole.mutate({
                          workerId: r.worker_id,
                          roleTypeId: lookup.delegate!,
                        })
                      }
                    >
                      Delegate
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
