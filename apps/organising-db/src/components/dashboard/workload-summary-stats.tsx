"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Target, Activity, AlertTriangle } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

interface WorkloadSummaryStatsProps {
  totalCampaigns: number;
  averageProgress: number;
  totalActivitiesUnderway: number;
  overdueCount: number;
  dueSoonCount: number;
  isLoading?: boolean;
}

export function WorkloadSummaryStats({
  totalCampaigns,
  averageProgress,
  totalActivitiesUnderway,
  overdueCount,
  dueSoonCount,
  isLoading,
}: WorkloadSummaryStatsProps) {
  const stats = [
    {
      label: "Total Campaigns",
      value: totalCampaigns,
      icon: Megaphone,
      color: "text-blue-600",
    },
    {
      label: "Average Progress",
      value: `${averageProgress}%`,
      icon: Target,
      color: "text-green-600",
    },
    {
      label: "Activities Underway",
      value: totalActivitiesUnderway,
      icon: Activity,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Main stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold min-h-[2rem] flex items-center">
                {isLoading ? (
                  <EurekaLoadingSpinner size="sm" />
                ) : (
                  stat.value
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert badges */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <div className="flex items-center gap-3 flex-wrap">
                {overdueCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-sm px-3 py-1"
                  >
                    {overdueCount} Overdue
                  </Badge>
                )}
                {dueSoonCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-sm px-3 py-1 border-amber-600 text-amber-700 dark:text-amber-400"
                  >
                    {dueSoonCount} Due Soon
                  </Badge>
                )}
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Campaigns requiring attention
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
