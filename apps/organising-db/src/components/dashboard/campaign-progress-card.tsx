"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, CheckCircle2, Clock } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import Link from "next/link";
import { differenceInDays } from "date-fns";

interface CampaignProgress {
  campaign_id: number;
  campaign_name: string;
  overall_progress_percentage: number;
  total_criteria: number;
  met_criteria: number;
  pending_assessments: number;
  is_overdue: boolean;
  is_due_soon: boolean;
  current_stage_name: string;
}

interface CampaignProgressCardProps {
  campaigns: CampaignProgress[];
  isLoading?: boolean;
}

export function CampaignProgressCard({
  campaigns,
  isLoading,
}: CampaignProgressCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Progress Towards Ambitions
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

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Progress Towards Ambitions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No active campaigns with progress data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          Progress Towards Ambitions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const progressPercent = campaign.overall_progress_percentage || 0;
            const hasWarning = campaign.is_overdue || campaign.is_due_soon;

            return (
              <Link
                key={campaign.campaign_id}
                href={`/campaigns/${campaign.campaign_id}`}
                className="block"
              >
                <div
                  className={`rounded-lg border p-4 transition-colors hover:bg-muted/50 ${
                    hasWarning ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm truncate">
                        {campaign.campaign_name}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {campaign.current_stage_name} •{" "}
                        {campaign.met_criteria}/{campaign.total_criteria}{" "}
                        criteria met
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        variant={progressPercent >= 80 ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {Math.round(progressPercent)}%
                      </Badge>
                      {campaign.pending_assessments > 0 && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs"
                          title={`${campaign.pending_assessments} pending assessments`}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {campaign.pending_assessments} pending
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Progress value={progressPercent} className="h-2" />

                  {hasWarning && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      {campaign.is_overdue && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Overdue
                        </span>
                      )}
                      {campaign.is_due_soon && !campaign.is_overdue && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Due soon
                        </span>
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
