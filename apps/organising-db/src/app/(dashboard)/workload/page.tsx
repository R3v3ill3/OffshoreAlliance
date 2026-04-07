"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/supabase/auth-context";
import { WorkloadFilters } from "@/components/dashboard/workload-filters";
import { WorkloadSummaryStats } from "@/components/dashboard/workload-summary-stats";
import { CampaignsByStageChart } from "@/components/dashboard/campaigns-by-stage-chart";
import { CampaignProgressCard } from "@/components/dashboard/campaign-progress-card";
import { CampaignEntitiesCard } from "@/components/dashboard/campaign-entities-card";
import { CampaignActivitiesCard } from "@/components/dashboard/campaign-activities-card";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { fetchWorkloadDashboard } from "@/lib/api/fetch-workload-dashboard";
import type { WorkloadDashboardData } from "@/lib/api/fetch-workload-dashboard";

export default function WorkloadDashboardPage() {
  const { user } = useAuth();
  const [filterOrganiser, setFilterOrganiser] = useState("team");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTimePeriod, setFilterTimePeriod] = useState("all");

  // Fetch workload data from API
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "workload-dashboard",
      filterOrganiser,
      filterStatus,
      filterTimePeriod,
    ],
    queryFn: async (): Promise<WorkloadDashboardData> =>
      fetchWorkloadDashboard({
        filterOrganiser,
        filterStatus,
        filterTimePeriod,
      }),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Workload Dashboard</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">
            Error Loading Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            {error.message ||
              "Unable to load workload data. Please try again later."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Workload Dashboard</h1>
      </div>

      {/* Filters */}
      <WorkloadFilters
        filterOrganiser={filterOrganiser}
        filterStatus={filterStatus}
        filterTimePeriod={filterTimePeriod}
        onFilterOrganiserChange={setFilterOrganiser}
        onFilterStatusChange={setFilterStatus}
        onFilterTimePeriodChange={setFilterTimePeriod}
      />

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20">
          <EurekaLoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <WorkloadSummaryStats
            totalCampaigns={data.metrics.totalCampaigns}
            averageProgress={data.metrics.averageProgress}
            totalActivitiesUnderway={data.metrics.totalActivitiesUnderway}
            overdueCount={data.metrics.overdueCount}
            dueSoonCount={data.metrics.dueSoonCount}
            isLoading={isLoading}
          />

          {/* Main Metrics Grid */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            {/* Metric 1: Campaigns by Stage Chart */}
            <div className="lg:col-span-2">
              <CampaignsByStageChart
                data={data.metrics.campaignsByStage}
                isLoading={isLoading}
              />
            </div>

            {/* Metric 2: Progress Towards Ambitions */}
            <div className="lg:col-span-1">
              <CampaignProgressCard
                campaigns={data.campaigns}
                isLoading={isLoading}
              />
            </div>

            {/* Metric 3: Worksites/Employers/Workers per Campaign */}
            <div className="lg:col-span-1">
              <CampaignEntitiesCard
                campaigns={data.campaigns}
                isLoading={isLoading}
              />
            </div>

            {/* Metric 4: Campaign Activities Underway */}
            <div className="lg:col-span-2">
              <CampaignActivitiesCard
                campaigns={data.campaigns}
                isLoading={isLoading}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
