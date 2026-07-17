"use client";

/**
 * Compact per-unit coverage signal for wall-chart unit cards:
 * leader/second status (gap / leader-no-second / covered) and, when
 * the unit sits inside a WOC's declared scope, whether it has a voice
 * on the committee. Rendered via CampaignUnitCard's headerBadges slot.
 */
import { Badge } from "@/components/ui/badge";
import { COVERAGE_STATUSES } from "@/lib/campaign/activist-constants";
import type { CoverageMapRow } from "./types";

export function UnitCoverageBadge({
  coverage,
  wocState,
}: {
  coverage: CoverageMapRow | null;
  wocState: { inScope: boolean; represented: boolean } | null;
}) {
  if (!coverage && !wocState?.inScope) return null;
  const status = coverage?.coverage_status
    ? COVERAGE_STATUSES[coverage.coverage_status]
    : null;
  // Only show the leader-coverage badge once a leader layer exists for
  // the campaign (otherwise every unit would shout "Gap" before the
  // organiser has started using the coverage map).
  const showStatus =
    status != null &&
    (coverage?.leader_worker_id != null ||
      coverage?.second_worker_id != null ||
      coverage?.priority_action != null ||
      coverage?.reachable_48h != null);
  return (
    <>
      {showStatus && (
        <Badge
          variant="outline"
          className={`text-[10px] ${status.badgeClass}`}
          title={
            coverage?.leader_name
              ? `Leader: ${coverage.leader_name}${
                  coverage.second_name ? ` · Second: ${coverage.second_name}` : ""
                }`
              : "No named leader for this unit"
          }
        >
          {status.label}
        </Badge>
      )}
      {wocState?.inScope && (
        <Badge
          variant="outline"
          className={
            wocState.represented
              ? "text-[10px] border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400"
              : "text-[10px] border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
          }
          title={
            wocState.represented
              ? "At least one current WOC member is assigned to this unit"
              : "In a WOC's scope but no current member from this unit"
          }
        >
          {wocState.represented ? "WOC" : "No WOC voice"}
        </Badge>
      )}
    </>
  );
}
