"use client";

/**
 * One survey/form import: header (title, campaign, AN link, delete), then
 *
 *   no batch          → the uploader
 *   batch, no report  → Data & questions | Analysis (review → brief → generate),
 *                       with the deterministic dashboard under Analysis
 *   report            → Report (dashboard + stale banner) | Data & questions |
 *                       Re-analyse
 *
 * Used verbatim by /surveys-forms/[id] and inside the campaign page.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Check, ExternalLink, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import type { AnSurveyBatch } from "@/lib/an-surveys/types";
import {
  describeAnSurveyError,
  useAnSurveyDetail,
  useAnSurveyReport,
  useDeleteAnSurvey,
  usePatchAnSurvey,
} from "@/lib/hooks/useAnSurveys";
import { UploadCsvStep } from "./import/UploadCsvStep";
import { ReviewSchemaTable } from "./import/ReviewSchemaTable";
import { ReviewStep } from "./analysis/ReviewStep";
import { SurveyReportDashboard } from "./report/SurveyReportDashboard";

export interface AnSurveyDetailProps {
  importId: string;
  campaignId?: number | null;
  /** Back affordance; when absent the header links to /surveys-forms. */
  onBack?: () => void;
  className?: string;
}

type View = "report" | "data" | "analysis";

export function AnSurveyDetail({ importId, campaignId, onBack, className }: AnSurveyDetailProps) {
  const router = useRouter();
  const { canWrite } = useAuth();
  const detail = useAnSurveyDetail(importId);
  const report = useAnSurveyReport(importId, { enabled: !!detail.data?.report });
  const patch = usePatchAnSurvey(importId);
  const del = useDeleteAnSurvey();

  // The user's explicit choice; until they make one the view follows the data.
  const [viewChoice, setView] = useState<View | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);

  const data = detail.data;
  const hasBatch = !!data?.current_batch;
  const hasReport = !!data?.report;
  const view: View = viewChoice ?? (hasReport ? "report" : "data");

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || !data || next === data.import.title) {
      setEditingTitle(false);
      return;
    }
    setHeaderError(null);
    try {
      await patch.mutateAsync({ title: next });
      setEditingTitle(false);
    } catch (e) {
      setHeaderError(describeAnSurveyError(e, "Could not rename"));
    }
  };

  const goBack = () => {
    if (onBack) onBack();
    else router.push("/surveys-forms");
  };

  const confirmDelete = async () => {
    setHeaderError(null);
    try {
      await del.mutateAsync(importId);
      toast.success("Import deleted");
      setDeleteOpen(false);
      goBack();
    } catch (e) {
      setHeaderError(describeAnSurveyError(e, "Could not delete"));
    }
  };

  if (detail.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !data) {
    return (
      <div className={cn("space-y-3", className)}>
        <Button type="button" variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
          Back
        </Button>
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {describeAnSurveyError(detail.error, "Could not load this import")}
        </p>
      </div>
    );
  }

  const imp = data.import;
  const linkedCampaignId = campaignId ?? imp.campaign_id;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="space-y-2">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs" onClick={goBack}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
          {onBack ? "Back to surveys & forms" : "All surveys & forms"}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            {editingTitle ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTitle();
                }}
              >
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="h-9 max-w-xl text-lg font-semibold"
                  aria-label="Title"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                />
                <Button type="submit" size="sm" variant="ghost" className="h-8 px-2" disabled={patch.isPending} aria-label="Save title">
                  {patch.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => setEditingTitle(false)} aria-label="Cancel">
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="truncate text-2xl font-bold">{imp.title}</h2>
                {canWrite && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      setTitleDraft(imp.title);
                      setEditingTitle(true);
                    }}
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-normal">
                {imp.source_kind === "survey" ? "Survey" : "Form"}
              </Badge>
              {linkedCampaignId != null ? (
                <Link
                  href={`/campaigns/${linkedCampaignId}?tab=outcomes&sub=surveys`}
                  className="inline-flex"
                  onClick={(e) => {
                    // Inside the campaign page the badge is just a label.
                    if (campaignId != null) e.preventDefault();
                  }}
                >
                  <Badge variant="info" className="font-normal">
                    {data.campaign_name ?? `Campaign ${linkedCampaignId}`}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="outline" className="font-normal">
                  Standalone
                </Badge>
              )}
              {imp.an_browser_url ? (
                <a
                  href={imp.an_browser_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  Action Network
                  {imp.an_total_records != null && ` · ${imp.an_total_records.toLocaleString()} submissions`}
                </a>
              ) : (
                <span>Not linked to Action Network</span>
              )}
              {data.current_batch && (
                <span>
                  · last upload {format(new Date(data.current_batch.uploaded_at), "d MMM yyyy, HH:mm")}
                </span>
              )}
            </div>
          </div>
          {canWrite && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
        {headerError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {headerError}
          </p>
        )}
      </div>

      {/* Body */}
      {!hasBatch ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Upload the CSV export</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <UploadCsvStep importId={importId} mode="first" onDone={() => setView("data")} />
            ) : (
              <p className="text-sm text-muted-foreground">No data has been uploaded for this import yet.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList className="mb-4">
            {hasReport && <TabsTrigger value="report">Report</TabsTrigger>}
            <TabsTrigger value="data">Data &amp; questions</TabsTrigger>
            <TabsTrigger value="analysis">{hasReport ? "Re-analyse" : "Analysis"}</TabsTrigger>
          </TabsList>

          {hasReport && (
            <TabsContent value="report">
              <SurveyReportDashboard
                importId={importId}
                campaignId={linkedCampaignId}
                onStartOver={() => setView("analysis")}
              />
            </TabsContent>
          )}

          <TabsContent value="data" className="space-y-6">
            <ReviewSchemaTable importId={importId} questions={data.questions} canWrite={canWrite} />
            <BatchHistory batches={data.batches} currentId={data.current_batch?.id ?? null} />
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            <ReviewStep
              importId={importId}
              questions={data.questions}
              canWrite={canWrite}
              initialReview={hasReport ? (report.data?.report?.review ?? null) : null}
              initialBrief={hasReport ? (report.data?.report?.extraction_brief ?? null) : null}
              onGenerated={() => setView("report")}
            />
            {!hasReport && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">The data so far</h3>
                <SurveyReportDashboard importId={importId} campaignId={linkedCampaignId} />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{imp.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the import, every uploaded batch and the report. Assessments already recorded from it are
              kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BatchHistory({ batches, currentId }: { batches: AnSurveyBatch[]; currentId: string | null }) {
  if (batches.length === 0) return null;
  const ordered = [...batches].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">Upload history</h3>
      <ul className="divide-y rounded-md border text-sm">
        {ordered.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <span className="font-medium">{b.file_name ?? "Upload"}</span>
              {b.id === currentId && (
                <Badge variant="success" className="ml-2 font-normal">
                  current
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                {format(new Date(b.uploaded_at), "d MMM yyyy, HH:mm")} · {b.headers.length} columns
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {b.row_count.toLocaleString()} rows · {b.response_count.toLocaleString()} respondents ·{" "}
              {b.duplicate_count.toLocaleString()} dup{b.duplicate_count === 1 ? "" : "s"}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Superseded uploads keep their headers for the change log; their rows are replaced by the current one.
      </p>
    </div>
  );
}
