"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function CampaignReportingCharts({ campaignId }: { campaignId: string }) {
  const supabase = createClient();

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("campaign_id", campaignId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["campaign-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id, oa_leader_role,
           worker:workers(
             worker_id,
             member_role_type:member_role_types(role_name),
             union_membership_type:union_membership_types(type_name)
           )`
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

  const { data: ous = [] } = useQuery({
    queryKey: ["campaign-ous", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ouAssign = [] } = useQuery({
    queryKey: ["campaign-worker-ou", campaignId],
    queryFn: async () => {
      const ouIds = ous.map((o: { ou_id: number }) => o.ou_id);
      if (ouIds.length === 0) return [];
      const { data, error } = await supabase.from("campaign_worker_ou").select("ou_id, worker_id").in("ou_id", ouIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: ous.length > 0,
  });

  const stats = useMemo(() => {
    const named = members.length;
    const estimate = (campaign?.total_worker_estimate as number | null) ?? 0;
    const unmapped = Math.max(0, estimate - named);

    const memberLike = members.filter((m) => {
      const row = m as { worker?: unknown };
      const wr = row.worker;
      const w = (Array.isArray(wr) ? wr[0] : wr) as {
        member_role_type?: unknown;
        union_membership_type?: unknown;
      } | null;
      const mtRaw = w?.member_role_type;
      const mt = (Array.isArray(mtRaw) ? mtRaw[0] : mtRaw) as { role_name?: string } | null;
      const umRaw = w?.union_membership_type;
      const um = (Array.isArray(umRaw) ? umRaw[0] : umRaw) as { type_name?: string } | null;
      return isWorkerMemberLike({
        unionMembershipTypeName: um?.type_name,
        memberRoleName: mt?.role_name,
      });
    }).length;

    const pctNamedOfEst = estimate > 0 ? Math.round((named / estimate) * 1000) / 10 : 0;
    const pctMemberOfNamed = named > 0 ? Math.round((memberLike / named) * 1000) / 10 : 0;
    const pctMemberOfEst = estimate > 0 ? Math.round((memberLike / estimate) * 1000) / 10 : 0;

    const delegates = members.filter((m) => (m as { oa_leader_role?: string }).oa_leader_role === "delegate").length;
    const activists = members.filter((m) => (m as { oa_leader_role?: string }).oa_leader_role === "activist").length;
    const contacts = members.filter((m) => (m as { oa_leader_role?: string }).oa_leader_role === "contact").length;

    const ouWithDelegate = new Set<number>();
    for (const a of ouAssign as { ou_id: number; worker_id: number }[]) {
      const m = members.find(
        (x: { worker_id: number; oa_leader_role: string | null }) => x.worker_id === a.worker_id
      );
      if (m?.oa_leader_role === "delegate") {
        ouWithDelegate.add(a.ou_id);
      }
    }

    return {
      named,
      estimate,
      unmapped,
      memberLike,
      pctNamedOfEst,
      pctMemberOfNamed,
      pctMemberOfEst,
      delegates,
      activists,
      contacts,
      ouWithDelegateCount: ouWithDelegate.size,
    };
  }, [campaign, members, ouAssign]);

  const mappingData = [
    { name: "Named workers", value: stats.named },
    { name: "Unmapped (est.)", value: stats.unmapped },
  ];

  const leadershipData = [
    { name: "Delegates", value: stats.delegates },
    { name: "Activists", value: stats.activists },
    { name: "Contacts", value: stats.contacts },
  ];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mapping</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.named}</p>
            <p className="text-xs text-muted-foreground">
              named vs {stats.estimate || "—"} estimated
              {stats.estimate > 0 && ` (${stats.pctNamedOfEst}%)`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membership density</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.pctMemberOfNamed}%</p>
            <p className="text-xs text-muted-foreground">of named workers are members / contacts</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.pctMemberOfEst}% of estimated</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">OA leadership</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-xs">
            <p>Delegates: {stats.delegates}</p>
            <p>Activists: {stats.activists}</p>
            <p>Contacts: {stats.contacts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">OUs with delegate</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.ouWithDelegateCount}</p>
            <p className="text-xs text-muted-foreground">of {ous.length} organising units</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total mapping</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={mappingData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Member leadership roles</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={leadershipData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="hsl(142 70% 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
