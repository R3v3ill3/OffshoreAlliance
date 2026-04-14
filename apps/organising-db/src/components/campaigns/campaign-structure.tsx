"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { OaLeaderRole } from "@/types/database";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import { CampaignUnitsSection } from "@/components/campaigns/campaign-units-section";

export function CampaignStructureSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();

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

  const updateOaRole = useAuthAwareMutation({
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
      <CampaignUnitsSection campaignId={campaignId} canWrite={canWrite} />
    </div>
  );
}
