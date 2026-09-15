"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
}: {
  orMatching: boolean;
  onOrMatchingChange: (orMatching: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
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
        <Switch
          id="universe-or-match"
          checked={orMatching}
          onCheckedChange={onOrMatchingChange}
          disabled={disabled}
          aria-label="Include workers from other employers at these sites"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Default is employer <span className="font-medium">and</span> worksite. Turn this on
        for a sector campaign (same as “Sector-wide campaign”).
      </p>
      {disabledReason ? (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      ) : null}
    </div>
  );
}
