"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, MapPin, UserCheck } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import Link from "next/link";

interface CampaignEntity {
  campaign_id: number;
  campaign_name: string;
  campaign_type: string;
  worksite_count: number;
  employer_count: number;
  worker_count: number;
  leader_count: number;
}

interface CampaignEntitiesCardProps {
  campaigns: CampaignEntity[];
  isLoading?: boolean;
}

export function CampaignEntitiesCard({
  campaigns,
  isLoading,
}: CampaignEntitiesCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Worksites, Employers & Workers per Campaign
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
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Worksites, Employers & Workers per Campaign
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No campaigns with entity data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Worksites, Employers & Workers per Campaign
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.campaign_id}
              href={`/campaigns/${campaign.campaign_id}`}
              className="block"
            >
              <div className="rounded-lg border p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium text-sm truncate">
                      {campaign.campaign_name}
                    </h4>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {campaign.campaign_type}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{campaign.worksite_count}</span>
                    <span className="text-xs text-muted-foreground">
                      Worksite{campaign.worksite_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{campaign.employer_count}</span>
                    <span className="text-xs text-muted-foreground">
                      Employer{campaign.employer_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{campaign.worker_count}</span>
                    <span className="text-xs text-muted-foreground">
                      Worker{campaign.worker_count !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium">{campaign.leader_count}</span>
                    <span className="text-xs text-muted-foreground">
                      Leader{campaign.leader_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
