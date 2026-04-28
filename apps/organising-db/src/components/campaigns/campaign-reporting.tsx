"use client";

import { useCampaignCurrentStats } from "@/lib/hooks/useCampaignCurrentStats";
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
  const stats = useCampaignCurrentStats(campaignId);

  const unmapped = Math.max(0, stats.totalWorkerEstimate - stats.namedWorkers);

  const mappingData = [
    { name: "Named workers", value: stats.namedWorkers },
    { name: "Unmapped (est.)", value: unmapped },
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
            <p className="text-2xl font-semibold">{stats.namedWorkers}</p>
            <p className="text-xs text-muted-foreground">
              named vs {stats.totalWorkerEstimate || "—"} estimated
              {stats.totalWorkerEstimate > 0 && ` (${stats.namedPctOfEstimate}%)`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membership density</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.densityOfNamed}%</p>
            <p className="text-xs text-muted-foreground">of named workers are members / contacts</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.densityOfEstimate}% of estimated</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Unit assignment</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-semibold">{stats.uniqueWorkersInUnits}</p>
            <p className="text-xs text-muted-foreground">
              workers in at least one unit ({stats.ouCount} units total)
            </p>
            {stats.multiUnitMembers > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {stats.multiUnitMembers} in multiple units —{" "}
                {stats.unitMemberships} unit memberships total
              </p>
            )}
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
