"use client";

import { Button } from "@/components/ui/button";
import type { MatchStatus } from "@/lib/hooks/useUpcomingProjects";

export type StatusFilter = "all" | MatchStatus | "review_or_unmatched";
export type JurisdictionFilter = "all" | "WA" | "NT";

interface FilterBarProps {
  jurisdiction: JurisdictionFilter;
  onJurisdictionChange: (j: JurisdictionFilter) => void;
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  needsReviewCount: number;
  unmatchedCount: number;
}

export function UpcomingProjectsFilterBar({
  jurisdiction,
  onJurisdictionChange,
  status,
  onStatusChange,
  needsReviewCount,
  unmatchedCount,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground mr-1">Jurisdiction:</span>
      {(["all", "WA", "NT"] as JurisdictionFilter[]).map((opt) => (
        <Button
          key={opt}
          size="sm"
          variant={jurisdiction === opt ? "default" : "outline"}
          onClick={() => onJurisdictionChange(opt)}
        >
          {opt === "all" ? "All" : opt}
        </Button>
      ))}
      <span className="text-xs text-muted-foreground mx-2">|</span>
      <span className="text-xs text-muted-foreground mr-1">Match:</span>
      <Button
        size="sm"
        variant={status === "all" ? "default" : "outline"}
        onClick={() => onStatusChange("all")}
      >
        All
      </Button>
      <Button
        size="sm"
        variant={status === "review_or_unmatched" ? "default" : "outline"}
        onClick={() => onStatusChange("review_or_unmatched")}
      >
        Needs attention ({needsReviewCount + unmatchedCount})
      </Button>
      <Button
        size="sm"
        variant={status === "needs_review" ? "default" : "outline"}
        onClick={() => onStatusChange("needs_review")}
      >
        Review ({needsReviewCount})
      </Button>
      <Button
        size="sm"
        variant={status === "unmatched" ? "default" : "outline"}
        onClick={() => onStatusChange("unmatched")}
      >
        Unmatched ({unmatchedCount})
      </Button>
      <Button
        size="sm"
        variant={status === "confirmed" ? "default" : "outline"}
        onClick={() => onStatusChange("confirmed")}
      >
        Confirmed
      </Button>
    </div>
  );
}
