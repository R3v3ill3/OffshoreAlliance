"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAmbitionRevisions } from "@/hooks/useAmbitionRevisions";
import { AmbitionReviewSheet } from "./AmbitionReviewSheet";

// ──────────────────────────────────────────────────────────────────
// AmbitionReviewBanner
//
// Persistent amber banner on the bargaining hub. Rendered when any
// industrial_outcomes campaign ambition has review_due_since set
// (triggered by log_of_claims yes, employer_proposal no, or WOC
// counter_offer_endorsed events).
//
// Opens AmbitionReviewSheet where the organiser can review and
// clear each flag.
// ──────────────────────────────────────────────────────────────────

interface AmbitionReviewBannerProps {
  campaignId: number;
}

export function AmbitionReviewBanner({ campaignId }: AmbitionReviewBannerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { hasDueAmbitions, dueAmbitions, isLoading } = useAmbitionRevisions(campaignId);

  // Don't render while loading or when nothing is flagged
  if (isLoading || !hasDueAmbitions) return null;

  const count = dueAmbitions.length;

  return (
    <>
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Review needed:{" "}
            {count === 1
              ? "1 industrial outcomes ambition may need updating"
              : `${count} industrial outcomes ambitions may need updating`}
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            A triggering event has occurred — a Log of Claims vote, employer
            proposal rejection, or WOC counter-offer endorsement. Review your
            ambitions to keep them accurate.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-900 hover:bg-amber-100 flex-shrink-0"
          onClick={() => setSheetOpen(true)}
        >
          Review now
        </Button>
      </div>

      <AmbitionReviewSheet
        campaignId={campaignId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
