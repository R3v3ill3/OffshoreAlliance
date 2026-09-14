"use client";

/**
 * Every survey/form import the user can see — standalone (all of them) or
 * scoped to one campaign. Used verbatim by /surveys-forms and by the
 * campaign page's Outcomes › Surveys & Forms sub-tab.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ClipboardList, ExternalLink, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import type { AnSurveyListItem } from "@/lib/an-surveys/types";
import { describeAnSurveyError, useAnSurveyList } from "@/lib/hooks/useAnSurveys";
import { CreateImportDialog } from "./import/CreateImportDialog";

export interface AnSurveyListProps {
  /** Scope to one campaign; also pre-fills the campaign on "New import". */
  campaignId?: number | null;
  /** When given, rows call this instead of linking to /surveys-forms/[id]. */
  onOpen?: (importId: string) => void;
  className?: string;
}

export function detailHref(importId: string): string {
  return `/surveys-forms/${encodeURIComponent(importId)}`;
}

const REPORT_STATE: Record<
  AnSurveyListItem["report_state"],
  { label: string; variant: "secondary" | "success" | "warning" }
> = {
  none: { label: "No report", variant: "secondary" },
  current: { label: "Report current", variant: "success" },
  stale: { label: "Report stale", variant: "warning" },
};

export function AnSurveyList({ campaignId, onOpen, className }: AnSurveyListProps) {
  const router = useRouter();
  const { canWrite } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, isError, error } = useAnSurveyList(campaignId ?? null);

  const open = (id: string) => {
    if (onOpen) onOpen(id);
    else router.push(detailHref(id));
  };

  const imports = data?.imports ?? [];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${imports.length} import${imports.length === 1 ? "" : "s"}${campaignId != null ? " in this campaign" : ""}`}
        </p>
        {canWrite && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden />
            New import
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {describeAnSurveyError(error, "Could not load surveys & forms")}
        </p>
      ) : imports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">No survey or form imports yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Link an Action Network form or survey, upload its CSV export, and get a per-question breakdown with
                an AI-written summary. Campaign-linked imports can also map answers onto assessments.
              </p>
            </div>
            {canWrite && (
              <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                New import
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                {campaignId == null && <TableHead>Campaign</TableHead>}
                <TableHead className="text-right">Respondents</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
                <TableHead>Last upload</TableHead>
                <TableHead>Report</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => {
                const state = REPORT_STATE[imp.report_state];
                const href = detailHref(imp.id);
                return (
                  <TableRow
                    key={imp.id}
                    className="cursor-pointer"
                    onClick={() => open(imp.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") open(imp.id);
                    }}
                    tabIndex={0}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {onOpen ? (
                          <span className="font-medium">{imp.title}</span>
                        ) : (
                          <Link
                            href={href}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {imp.title}
                          </Link>
                        )}
                        {imp.an_browser_url && (
                          <a
                            href={imp.an_browser_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Open in Action Network"
                            title={
                              imp.an_total_records != null
                                ? `Action Network reports ${imp.an_total_records.toLocaleString()} submissions`
                                : "Open in Action Network"
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {imp.source_kind === "survey" ? "Survey" : "Form"}
                        {imp.current_batch?.file_name ? ` · ${imp.current_batch.file_name}` : ""}
                      </p>
                    </TableCell>
                    {campaignId == null && (
                      <TableCell>
                        {imp.campaign_id != null ? (
                          <Badge variant="info" className="font-normal" title={imp.campaign_name ?? undefined}>
                            {imp.campaign_name ?? `Campaign ${imp.campaign_id}`}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal">
                            Standalone
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {imp.current_batch ? imp.current_batch.response_count.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {imp.current_batch ? imp.current_batch.row_count.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {imp.current_batch ? format(new Date(imp.current_batch.uploaded_at), "d MMM yyyy") : "No data yet"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={state.variant} className="font-normal">
                        {state.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateImportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        campaignId={campaignId ?? null}
        onCreated={(id) => open(id)}
      />
    </div>
  );
}
