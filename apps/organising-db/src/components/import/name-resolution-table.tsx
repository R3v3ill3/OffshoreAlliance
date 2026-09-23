"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NAME_REVIEWS_PATH } from "@/lib/name-reviews/path";
import {
  isQueuedOutcome,
  resolutionStatusLabel,
  type NameEntity,
  type ResolutionOutcome,
} from "@/lib/import/resolve-names-types";

/**
 * Read-only outcome table of the single resolution path (DA0.3 §2.4.4):
 * raw string → matched name + method + score, or the queued proposals, with
 * the link to the Name Reviews page. No picking and no creating here.
 */

function statusVariant(status: ResolutionOutcome["status"]): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "exact":
    case "alias":
      return "default";
    case "auto":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

export function NameReviewsLink({ queued, entity }: { queued: number; entity?: NameEntity }) {
  if (queued === 0) return null;
  const noun = entity ? `${entity} name${queued === 1 ? "" : "s"}` : `name${queued === 1 ? "" : "s"}`;
  return (
    <Link
      href={NAME_REVIEWS_PATH}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
    >
      {queued} {noun} queued — open Name Reviews
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

export function NameResolutionTable({
  entity,
  outcomes,
  persisted = false,
}: {
  entity: NameEntity;
  outcomes: readonly ResolutionOutcome[];
  /** false in the wizards' matching steps (dry run): auto matches are labelled as pending. */
  persisted?: boolean;
}) {
  const queued = outcomes.filter((o) => isQueuedOutcome(o.status)).length;
  const matched = outcomes.filter((o) => o.resolvedId != null).length;
  const rejected = outcomes.filter((o) => o.status === "rejected").length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {outcomes.length} unique {entity} name{outcomes.length !== 1 ? "s" : ""} found:{" "}
          {matched} matched
          {queued > 0 ? `, ${queued} queued for review` : ""}
          {rejected > 0 ? `, ${rejected} rejected earlier` : ""}.
          {queued > 0
            ? ` Queued names are imported with no ${entity} and filled in when the queue is decided.`
            : ""}
        </p>
        <NameReviewsLink queued={queued} entity={entity} />
      </div>
      <div className="max-h-[380px] overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name in file</TableHead>
              <TableHead className="w-16 text-right">Rows</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Matched to / proposals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcomes.map((o) => (
              <TableRow key={o.normalisedName} data-status={o.status}>
                <TableCell className="text-sm font-medium">{o.rawName}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">{o.occurrences}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(o.status)} className="whitespace-nowrap text-[11px]">
                    {resolutionStatusLabel(o.status, persisted)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {o.resolvedId != null ? (
                    <span>
                      {o.resolvedName}
                      {o.score != null ? (
                        <span className="ml-1 text-muted-foreground">{Math.round(o.score * 100)}%</span>
                      ) : null}
                    </span>
                  ) : o.proposals.length > 0 ? (
                    <span className="text-muted-foreground">
                      {o.proposals
                        .map((p) => `${p.name} ${Math.round(p.score * 100)}%`)
                        .join(" · ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
