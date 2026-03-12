"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
// #region agent log - debug helper
const _dbgDash = (msg: string, data: Record<string, unknown>) =>
  fetch('http://127.0.0.1:7432/ingest/c8c97c5f-af35-4118-b37c-4421b9062a9c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'3b174c'},body:JSON.stringify({sessionId:'3b174c',location:'dashboard/page.tsx',message:msg,data,hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{});
// #endregion
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, FileText, Megaphone, AlertTriangle } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { differenceInDays, format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();

  // #region agent log - H1/H5: track user and query enabled state
  _dbgDash('DashboardPage render', { userId: user?.id ?? null, userEnabled: !!user });
  // #endregion

  const { data: workerCount = 0, isLoading: loadingWorkers } = useQuery({
    queryKey: ["workers-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workers")
        .select("*", { count: "exact", head: true });
      // #region agent log - H5: worker count query result
      _dbgDash('workers-count queryFn', { count, error: (error as {message?: string} | null)?.message ?? null });
      // #endregion
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: memberCount = 0, isLoading: loadingMembers } = useQuery({
    queryKey: ["members-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("workers")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .not("member_number", "is", null);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: agreementCount = 0, isLoading: loadingAgreements } = useQuery({
    queryKey: ["agreements-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("agreements")
        .select("*", { count: "exact", head: true })
        .eq("status", "Current");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: campaignCount = 0, isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("status", "active");
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: expiringAgreements = [], isLoading: loadingExpiring } = useQuery({
    queryKey: ["agreements-expiring"],
    queryFn: async () => {
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() + 90);

      const { data } = await supabase
        .from("agreements")
        .select("agreement_id, decision_no, agreement_name, expiry_date")
        .gte("expiry_date", now.toISOString().split("T")[0])
        .lte("expiry_date", cutoff.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true })
        .limit(10);
      return data ?? [];
    },
    enabled: !!user,
  });

  const expiringCount = expiringAgreements.length;

  const stats = useMemo(
    () => [
      {
        label: "Total Workers",
        value: workerCount,
        icon: Users,
        loading: loadingWorkers,
      },
      {
        label: "Total Members",
        value: memberCount,
        icon: Building2,
        loading: loadingMembers,
      },
      {
        label: "Agreements (Current)",
        value: agreementCount,
        icon: FileText,
        loading: loadingAgreements,
      },
      {
        label: "Active Campaigns",
        value: campaignCount,
        icon: Megaphone,
        loading: loadingCampaigns,
      },
      {
        label: "Expiring in 90 Days",
        value: expiringCount,
        icon: AlertTriangle,
        loading: loadingExpiring,
      },
    ],
    [
      workerCount, memberCount, agreementCount, campaignCount, expiringCount,
      loadingWorkers, loadingMembers, loadingAgreements, loadingCampaigns, loadingExpiring,
    ]
  );

  function getBadgeVariant(daysRemaining: number) {
    if (daysRemaining < 30) return "destructive";
    if (daysRemaining <= 60) return "warning";
    return "success";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold min-h-[2rem] flex items-center">
                {stat.loading ? (
                  <EurekaLoadingSpinner size="sm" />
                ) : (
                  stat.value.toLocaleString()
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Campaign activity and recent updates will appear here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agreements Expiring Soon</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingExpiring ? (
              <div className="flex items-center justify-center py-6">
                <EurekaLoadingSpinner size="md" />
              </div>
            ) : expiringAgreements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No agreements expiring in the next 90 days.
              </p>
            ) : (
              <div className="space-y-3">
                {expiringAgreements.map((ag) => {
                  const daysRemaining = differenceInDays(
                    new Date(ag.expiry_date!),
                    new Date()
                  );
                  return (
                    <div
                      key={ag.agreement_id}
                      className="flex items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{ag.decision_no}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {ag.agreement_name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(ag.expiry_date!), "dd MMM yyyy")}
                        </span>
                        <Badge variant={getBadgeVariant(daysRemaining)}>
                          {daysRemaining}d
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
