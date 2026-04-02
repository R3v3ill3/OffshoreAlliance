"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import Link from "next/link";

interface CampaignActivity {
  campaign_id: number;
  campaign_name: string;
  current_stage_name: string;
  total_activities_underway: number;
  in_progress_actions: number;
  pending_gate_assessments: number;
  active_stage_plans: number;
  is_overdue: boolean;
  is_due_soon: boolean;
}

interface CampaignActivitiesCardProps {
  campaigns: CampaignActivity[];
  isLoading?: boolean;
}

export function CampaignActivitiesCard({
  campaigns,
  isLoading,
}: CampaignActivitiesCardProps) {
  // Sort campaigns by activity count (most active first)
  const sortedCampaigns = [...campaigns].sort(
    (a, b) => b.total_activities_underway - a.total_activities_underway
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Campaign Activities Underway
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <EurekaLoadingSpinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sortedCampaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Campaign Activities Underway
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No campaign activities currently underway.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Campaign Activities Underway
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedCampaigns.map((campaign) => {
            const hasActivities = campaign.total_activities_underway > 0;
            const isUrgent = campaign.is_overdue || campaign.is_due_soon;

            return (
              <Link
                key={campaign.campaign_id}
                href={`/campaigns/${campaign.campaign_id}`}
                className="block"
              >
                <div
                  className={`rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
                    isUrgent && hasActivities
                      ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate">
                          {campaign.campaign_name}
                        </h4>
                        {isUrgent && hasActivities && (
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {campaign.current_stage_name}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={
                          hasActivities
                            ? isUrgent
                              ? "destructive"
                              : "default"
                            : "secondary"
                        }
                        className="shrink-0"
                      >
                        {campaign.total_activities_underway} active
                      </Badge>
                    </div>
                  </div>

                  {hasActivities && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {campaign.in_progress_actions > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>
                            {campaign.in_progress_actions} action
                            {campaign.in_progress_actions !== 1 ? "s" : ""} in
                            progress
                          </span>
                        </div>
                      )}

                      {campaign.pending_gate_assessments > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            {campaign.pending_gate_assessments} gate
                            assessment
                            {campaign.pending_gate_assessments !== 1
                              ? "s"
                              : ""}{" "}
                            pending
                          </span>
                        </div>
                      )}

                      {campaign.active_stage_plans > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Activity className="h-3 w-3" />
                          <span>
                            {campaign.active_stage_plans} stage plan
                            {campaign.active_stage_plans !== 1 ? "s" : ""}{" "}
                            active
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
