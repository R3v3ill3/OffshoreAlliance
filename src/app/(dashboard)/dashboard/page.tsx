"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Building2, FileText, Megaphone, AlertTriangle, Star, BarChart2 } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { differenceInDays, format } from "date-fns";
import {
  PrincipalEmployerEbaChart,
  EbaSummaryLegend,
} from "@/components/reports/principal-employer-eba-chart";
import { AgreementsCalendar } from "@/components/agreements/agreements-calendar";
import { WorksiteDistributionChart } from "@/components/dashboard/worksite-distribution-chart";
import type { PrincipalEmployerEbaSummary } from "@/types/database";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();

  const { data: workerCount = 0, isLoading: loadingWorkers } = useQuery({
    queryKey: ["workers-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("workers")
        .select("*", { count: "exact", head: true });
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
        .select(
          `
          agreement_id,
          decision_no,
          agreement_name,
          short_name,
          expiry_date,
          status,
          employer:employers(employer_name)
          `
        )
        .gte("expiry_date", now.toISOString().split("T")[0])
        .lte("expiry_date", cutoff.toISOString().split("T")[0])
        .order("expiry_date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: activeCampaigns = [], isLoading: loadingActiveCampaigns } = useQuery({
    queryKey: ["active-campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: worksiteDistribution = [], isLoading: loadingWorksiteDist } = useQuery({
    queryKey: ["worksite-distribution"],
    queryFn: async () => {
      // Fetch worksite types to aggregate
      const { data } = await supabase
        .from("worksites")
        .select("worksite_type")
        .eq("is_active", true);

      if (!data) return [];

      // Aggregate counts
      const counts: Record<string, number> = {};
      data.forEach((w) => {
        const type = w.worksite_type || "Unknown";
        counts[type] = (counts[type] || 0) + 1;
      });

      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    },
    enabled: !!user,
  });

  // Principal Employer EBA coverage summary
  const { data: ebaSummary = [], isLoading: loadingEba } = useQuery({
    queryKey: ["principal-employer-eba-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("principal_employer_eba_summary")
        .select("*")
        .order("principal_employer_name");
      if (error) throw error;
      return data as PrincipalEmployerEbaSummary[];
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

      {/* Summary stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
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

      {/* EBA Coverage by Principal Employer */}
      <Card className="col-span-full">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              EBA Coverage by Principal Employer
            </CardTitle>
            <CardDescription>
              Distribution of employer-worksite pairs by EBA status across Shell,
              Woodside, Inpex and Chevron assets. Includes group company (parent
              company) relationships.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/reports")}
          >
            <BarChart2 className="h-4 w-4" />
            Full Report
          </Button>
        </CardHeader>
        <CardContent>
          {loadingEba ? (
            <div className="flex items-center justify-center py-8">
              <EurekaLoadingSpinner size="md" />
            </div>
          ) : ebaSummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <Star className="h-8 w-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm max-w-md">
                No EBA coverage data yet. Assign Principal Employers to worksites
                and link employers to those worksites to populate this report.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/worksites")}
              >
                Go to Worksites
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Combined chart for all principal employers */}
              <div className="overflow-x-auto">
                <PrincipalEmployerEbaChart data={ebaSummary} />
              </div>

              {/* Per-employer detail cards */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {ebaSummary.map((pe) => (
                  <Card key={pe.principal_employer_id} className="border-dashed">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                        {pe.principal_employer_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {pe.total_pairs} employer-worksite pair
                        {pe.total_pairs !== 1 ? "s" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Mini bar for this PE */}
                      <div className="mb-3">
                        <PrincipalEmployerEbaChart
                          data={[pe]}
                          compact
                        />
                      </div>
                      <EbaSummaryLegend summary={pe} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreements Calendar */}
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Agreements Expiring Soon (Calendar View)</CardTitle>
          <CardDescription>
            Interactive timeline of agreements expiring within the next 90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingExpiring ? (
            <div className="flex items-center justify-center py-8">
              <EurekaLoadingSpinner size="md" />
            </div>
          ) : expiringAgreements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No agreements expiring in the next 90 days.
            </div>
          ) : (
            // Cast to force TS to accept the extended shape if strict
            <AgreementsCalendar agreements={expiringAgreements as any[]} />
          )}
        </CardContent>
      </Card>

      {/* Grid: Active Campaigns & Worksite Distribution */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Active Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActiveCampaigns ? (
              <div className="flex items-center justify-center py-6">
                <EurekaLoadingSpinner size="md" />
              </div>
            ) : activeCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active campaigns at the moment.
              </p>
            ) : (
              <div className="space-y-4">
                {activeCampaigns.map((camp) => (
                  <div
                    key={camp.campaign_id}
                    className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{camp.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {camp.description || "No description"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="capitalize">
                      {camp.campaign_type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worksite Distribution */}
        <div className="h-[400px]">
          <WorksiteDistributionChart
            data={worksiteDistribution}
            isLoading={loadingWorksiteDist}
          />
        </div>
      </div>

      {/* Recent Activity (Moved to bottom) */}
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
    </div>
  );
}
