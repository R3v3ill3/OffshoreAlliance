"use client";

import Link from "next/link";
import { weeklyUpdatesHref } from "@/lib/membership-updates/href";
import {
  useNameMatchReviews,
  useNameReviewDeciders,
  type NameReviewFilters,
} from "@/lib/hooks/useNameMatchReviews";
import { ReviewRow, type DecisionReport } from "./review-row";

/** Administration → Data Management, where the membership and worker wizards are mounted. */
const IMPORTS_HREF = "/administration?tab=data";

interface Props {
  filters: NameReviewFilters;
  isAdmin: boolean;
  onDecided: (report: DecisionReport) => void;
}

export function ReviewList({ filters, isAdmin, onDecided }: Props) {
  const { data, isLoading, error } = useNameMatchReviews(filters);
  const rows = data ?? [];
  const deciders = useNameReviewDeciders(
    rows.map((r) => r.decided_by).filter((id): id is string => typeof id === "string")
  );

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground space-y-2">
        <p>
          {filters.status === "open"
            ? `No ${filters.entity} names are waiting for review.`
            : "No names match these filters."}
        </p>
        <p>
          Names reach this queue from the{" "}
          <Link href={IMPORTS_HREF} className="text-primary underline underline-offset-2">
            membership and worker imports
          </Link>{" "}
          and the{" "}
          <Link href={weeklyUpdatesHref()} className="text-primary underline underline-offset-2">
            weekly updates
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {rows.length} name{rows.length === 1 ? "" : "s"}
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            isAdmin={isAdmin}
            deciderName={row.decided_by ? (deciders.data?.[row.decided_by] ?? null) : null}
            onDecided={onDecided}
          />
        ))}
      </ul>
    </div>
  );
}
