"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UniverseMembershipRefreshDialog } from "@/components/campaigns/universe-membership-refresh-dialog";

/**
 * Campaign-level membership rule. Default AND (employer and worksite).
 * Sector-wide campaigns use OR (employer or worksite) — the previous default
 * that pulled every contractor at a listed site into a single-employer campaign.
 */
export function UniverseMatchModeControl({
  orMatching,
  onOrMatchingChange,
  disabled,
  disabledReason,
  campaignId,
}: {
  orMatching: boolean;
  onOrMatchingChange: (orMatching: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Saved campaign — shows Refresh, which reads campaign_employers from the DB. */
  campaignId?: number | null;
}) {
  const [refreshOpen, setRefreshOpen] = useState(false);
  const canRefresh = campaignId != null && Number.isFinite(campaignId);

  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Label htmlFor="universe-or-match" className="text-sm font-medium">
            Include other employers at these sites
          </Label>
          <p className="text-sm text-muted-foreground">
            {orMatching
              ? "Employer or worksite — anyone at a listed site is added, even if they work for another employer."
              : "Employer and worksite — only workers whose employer is on this campaign and whose site is listed."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRefresh ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={orMatching}
              title={
                orMatching
                  ? "Turn off “Include other employers at these sites” before refreshing membership."
                  : "Review allocated workers and remove those with another employer."
              }
              onClick={() => setRefreshOpen(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          ) : null}
          <Switch
            id="universe-or-match"
            checked={orMatching}
            onCheckedChange={onOrMatchingChange}
            disabled={disabled}
            aria-label="Include workers from other employers at these sites"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Default is employer <span className="font-medium">and</span> worksite. Turn this on
        for a sector campaign (same as “Sector-wide campaign”).
      </p>
      {disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
      {canRefresh ? (
        <UniverseMembershipRefreshDialog
          campaignId={campaignId}
          open={refreshOpen}
          onOpenChange={setRefreshOpen}
        />
      ) : null}
    </div>
  );
}
