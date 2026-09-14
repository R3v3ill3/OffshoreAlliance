"use client";

/**
 * The interactive survey/form report, patterned on SmsSurveyReportDashboard.
 *
 * Headline tiles, the AI narrative (when a report exists), then one section
 * per question / cross-tab / free-text block in chart_spec order — or every
 * question in order when there is no report yet, so the deterministic view
 * is useful the moment a CSV lands.
 *
 * Every figure is the app's; the AI text sits beside the chart, never
 * instead of it. `number_guard_warnings` — figures in the prose the app
 * could not match — are shown as an amber "Check these figures" note.
 *
 * Free-text verbatims: fetched lazily. The report is first loaded with
 * includeText=0; the first "Show responses" click flips the whole query to
 * includeText=1 (keepPreviousData keeps the charts on screen meanwhile).
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  ListChecks,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatPercent, type SurveyReportLabelMode } from "@/lib/sms/survey-report";
import type { FreeTextAggregate } from "@/lib/an-surveys/types";
import {
  AN_SURVEY_LABEL_MODE_STORAGE_KEY,
  buildSections,
  choiceRows,
  crosstabTokensFor,
  multiSelectRows,
  questionNumbers,
  type DashboardSection,
  type DisplayRow,
} from "@/lib/an-survey-report/helpers";
import {
  describeAnSurveyError,
  fetchAnSurveyRows,
  useAnSurveyDetail,
  useAnSurveyReport,
  useGenerateAnSurveyReport,
} from "@/lib/hooks/useAnSurveys";
import { ImportParticipationDialog } from "@/components/campaigns/wall-chart/participation-import/import-participation-dialog";
import type { CsvData } from "@/components/campaigns/wall-chart/participation-import/types";
import { UploadCsvStep } from "../import/UploadCsvStep";
import { StaleBanner } from "../analysis/StaleBanner";
import { CrossTabView, QuestionChart, RowsHBar } from "./charts";
import { DownloadHtmlDialog } from "./DownloadHtmlDialog";

const LABEL_MODES: { id: SurveyReportLabelMode; label: string; hint: string }[] = [
  { id: "count", label: "#", hint: "Show counts" },
  { id: "percent", label: "%", hint: "Show percentages" },
];

function readStoredLabelMode(): SurveyReportLabelMode {
  if (typeof window === "undefined") return "count";
  const stored = window.localStorage.getItem(AN_SURVEY_LABEL_MODE_STORAGE_KEY);
  return stored === "percent" || stored === "count" ? stored : "count";
}

export interface SurveyReportDashboardProps {
  importId: string;
  campaignId?: number | null;
  /** "Start over" — the parent switches to the analysis view. */
  onStartOver?: () => void;
  className?: string;
}

export function SurveyReportDashboard({ importId, campaignId, onStartOver, className }: SurveyReportDashboardProps) {
  const { canWrite } = useAuth();
  const [labelMode, setLabelMode] = useState<SurveyReportLabelMode>(readStoredLabelMode);
  const [includeNoAnswer, setIncludeNoAnswer] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [crosstabs, setCrosstabs] = useState<string[]>([]);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [mapSource, setMapSource] = useState<CsvData | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const chooseLabelMode = (mode: SurveyReportLabelMode) => {
    setLabelMode(mode);
    window.localStorage.setItem(AN_SURVEY_LABEL_MODE_STORAGE_KEY, mode);
  };

  const detail = useAnSurveyDetail(importId);
  const report = useAnSurveyReport(importId, { crosstabs, includeText });
  const generate = useGenerateAnSurveyReport(importId);

  // The chart_spec decides which cross-tabs to ask for; once the first
  // response arrives, widen the query to include them.
  useEffect(() => {
    const wanted = crosstabTokensFor(report.data?.report?.chart_spec ?? null);
    const missing = wanted.filter((t) => !crosstabs.includes(t));
    if (missing.length > 0) setCrosstabs((prev) => [...new Set([...prev, ...missing])]);
  }, [report.data, crosstabs]);

  const data = report.data;
  const sections = useMemo(
    () => (data ? buildSections(data.questions, data.aggregates, data.report) : []),
    [data]
  );
  const numbers = useMemo(() => (data ? questionNumbers(data.questions) : new Map<string, number>()), [data]);

  const reportBatchUploadedAt = useMemo(() => {
    const batchId = data?.report?.batch_id;
    if (!batchId) return null;
    return detail.data?.batches.find((b) => b.id === batchId)?.uploaded_at ?? null;
  }, [data?.report?.batch_id, detail.data?.batches]);

  const rerun = async () => {
    setActionError(null);
    try {
      await generate.mutateAsync({ reuse_current: true });
    } catch (e) {
      setActionError(describeAnSurveyError(e, "Re-running the analysis failed"));
    }
  };

  const openMapToAssessment = async () => {
    setActionError(null);
    setMapBusy(true);
    try {
      const rows = await fetchAnSurveyRows(importId);
      setMapSource({ fileName: rows.fileName, headers: rows.headers, rows: rows.rows });
    } catch (e) {
      setActionError(describeAnSurveyError(e, "Could not load the rows for mapping"));
    } finally {
      setMapBusy(false);
    }
  };

  if (report.isLoading && !data) {
    return <DashboardSkeleton className={className} />;
  }

  if (report.isError && !data) {
    return (
      <div className={cn("py-10 text-center text-sm text-muted-foreground", className)}>
        {describeAnSurveyError(report.error, "Report unavailable")}
      </div>
    );
  }

  if (!data) return null;

  // No batch yet: the only useful thing to show is the uploader.
  if (!data.aggregates) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" aria-hidden />
            Upload the CSV to start
          </CardTitle>
        </CardHeader>
        <CardContent>
          {canWrite ? (
            <UploadCsvStep importId={importId} mode="first" onDone={() => void report.refetch()} />
          ) : (
            <p className="text-sm text-muted-foreground">No data has been uploaded for this import yet.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const { headline } = data.aggregates;
  const rep = data.report;
  const canRerun = !!rep?.extraction_brief;
  const isCampaignLinked = (campaignId ?? data.import.campaign_id) != null;
  const mapCampaignId = campaignId ?? data.import.campaign_id;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <Button type="button" variant="outline" size="sm" onClick={() => setRefreshOpen(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Refresh data
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setDownloadOpen(true)}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Download HTML
          </Button>
          {canWrite && isCampaignLinked && mapCampaignId != null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mapBusy}
              onClick={() => void openMapToAssessment()}
            >
              <ListChecks className={cn("mr-1.5 h-3.5 w-3.5", mapBusy && "animate-pulse")} aria-hidden />
              Map to assessment
            </Button>
          )}
          {canWrite && rep && !rep.stale && (
            <>
              {canRerun && (
                <Button type="button" variant="ghost" size="sm" disabled={generate.isPending} onClick={() => void rerun()}>
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", generate.isPending && "animate-spin")} aria-hidden />
                  Re-run analysis
                </Button>
              )}
              {onStartOver && (
                <Button type="button" variant="ghost" size="sm" disabled={generate.isPending} onClick={onStartOver}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Start over
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={includeNoAnswer} onCheckedChange={setIncludeNoAnswer} aria-label="Include no answer" />
            Include no answer
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Labels</span>
            <div className="inline-flex rounded-md border p-0.5">
              {LABEL_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.hint}
                  onClick={() => chooseLabelMode(mode.id)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    labelMode === mode.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {actionError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {actionError}
        </p>
      )}

      {rep?.stale && (
        <StaleBanner
          reportBatchUploadedAt={reportBatchUploadedAt}
          generatedAt={rep.generated_at}
          canRerun={canRerun}
          canWrite={canWrite}
          busy={generate.isPending}
          onRerun={() => void rerun()}
          onStartOver={() => onStartOver?.()}
        />
      )}

      {/* Headline tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeadlineCard label="Respondents" value={headline.respondents} accent />
        <HeadlineCard
          label="Submissions"
          value={headline.submissions}
          sub={headline.file_name ? `from ${headline.file_name}` : undefined}
        />
        <HeadlineCard
          label="Duplicates"
          value={headline.duplicates}
          sub={headline.duplicates > 0 ? "same person, latest submission kept" : "none found"}
        />
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">AN reported total</p>
            <p className="text-3xl font-semibold tabular-nums">
              {headline.an_total_records != null ? headline.an_total_records.toLocaleString() : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {headline.an_total_records != null
                ? `AN reports ${headline.an_total_records.toLocaleString()} submissions; CSV has ${headline.submissions.toLocaleString()} rows / ${headline.respondents.toLocaleString()} people`
                : "Not linked to an Action Network action"}
              {data.import.an_browser_url && (
                <a
                  href={data.import.an_browser_url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground"
                  aria-label="Open in Action Network"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Narrative */}
      {rep ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-start gap-2 text-base">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{rep.narrative.headline}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="whitespace-pre-line text-sm">{rep.narrative.summary}</p>
            {rep.narrative.caveats.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Caveats</p>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {rep.narrative.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {rep.number_guard_warnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                <p className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                  Check these figures
                </p>
                <p className="mb-1 text-muted-foreground">
                  The narrative mentions numbers the app could not match to its own counts. Trust the charts.
                </p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {rep.number_guard_warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Generated {new Date(rep.generated_at).toLocaleString()}
              {rep.model ? ` · ${rep.model}` : ""}
            </p>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No AI report yet — these are the app&apos;s own counts for every question. Run the analysis to add a
          narrative, choose the charts and theme the free-text answers.
        </p>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No questions are included in the report. Switch some on under Data &amp; questions.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => (
            <SectionCard
              key={sectionKey(section)}
              section={section}
              number={"qkey" in section ? numbers.get(section.qkey) : undefined}
              labelMode={labelMode}
              includeNoAnswer={includeNoAnswer}
              textLoaded={includeText}
              textLoading={includeText && report.isFetching}
              onWantText={() => setIncludeText(true)}
              crosstabLoading={report.isFetching}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={refreshOpen} onOpenChange={setRefreshOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Refresh data</DialogTitle>
            <DialogDescription>Upload a newer Action Network export to replace the current responses.</DialogDescription>
          </DialogHeader>
          <UploadCsvStep
            importId={importId}
            mode="refresh"
            onDone={() => {
              setRefreshOpen(false);
              void report.refetch();
            }}
          />
        </DialogContent>
      </Dialog>

      <DownloadHtmlDialog importId={importId} title={data.import.title} open={downloadOpen} onOpenChange={setDownloadOpen} />

      {mapSource && mapCampaignId != null && (
        <ImportParticipationDialog
          campaignId={String(mapCampaignId)}
          open
          onOpenChange={(open) => {
            if (!open) setMapSource(null);
          }}
          initialSource={mapSource}
        />
      )}
    </div>
  );
}

function sectionKey(s: DashboardSection): string {
  if (s.kind === "crosstab") return `x:${s.row_qkey}|${s.col_qkey}`;
  return `${s.kind}:${s.qkey}`;
}

function HeadlineCard({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("text-3xl font-semibold tabular-nums", accent && "text-emerald-600")}>{value.toLocaleString()}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={sub}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  section,
  number,
  labelMode,
  includeNoAnswer,
  textLoaded,
  textLoading,
  onWantText,
  crosstabLoading,
}: {
  section: DashboardSection;
  number: number | undefined;
  labelMode: SurveyReportLabelMode;
  includeNoAnswer: boolean;
  textLoaded: boolean;
  textLoading: boolean;
  onWantText: () => void;
  crosstabLoading: boolean;
}) {
  const lead = section.kind === "question" && section.emphasis === "lead";
  const title =
    section.kind === "crosstab"
      ? `${section.rowQuestion.label} × ${section.colQuestion.label}`
      : section.question.label;

  return (
    <Card className={cn(lead && "md:col-span-2 border-primary/40")}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-start gap-2 text-sm font-medium">
          {number != null && (
            <Badge variant="secondary" className="shrink-0">
              Q{number}
            </Badge>
          )}
          {section.kind === "crosstab" && (
            <Badge variant="outline" className="shrink-0">
              Cross-tab
            </Badge>
          )}
          <span className="leading-snug">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className={cn(lead && "md:grid md:grid-cols-[1fr_320px] md:gap-4")}>
        <div>
          {section.kind === "question" && (
            <QuestionBody section={section} labelMode={labelMode} includeNoAnswer={includeNoAnswer} />
          )}
          {section.kind === "crosstab" &&
            (section.crosstab ? (
              <CrossTabView
                crosstab={section.crosstab}
                chart={section.chart}
                labelMode={labelMode}
                rowLabel={section.rowQuestion.label}
                colLabel={section.colQuestion.label}
              />
            ) : crosstabLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Cross-tab not available.</p>
            ))}
          {section.kind === "free_text" && (
            <FreeTextBody
              agg={section.agg}
              summary={section.summary}
              textLoaded={textLoaded}
              textLoading={textLoading}
              onWantText={onWantText}
            />
          )}
        </div>
        {section.insight && (
          <div className={cn("mt-3 rounded-md border bg-muted/40 p-3 text-sm", lead && "md:mt-0")}>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3" aria-hidden />
              Insight
            </p>
            <p className="whitespace-pre-line">{section.insight}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionBody({
  section,
  labelMode,
  includeNoAnswer,
}: {
  section: Extract<DashboardSection, { kind: "question" }>;
  labelMode: SurveyReportLabelMode;
  includeNoAnswer: boolean;
}) {
  const { agg } = section;
  const rows: DisplayRow[] =
    agg.qtype === "multi_select" ? multiSelectRows(agg, includeNoAnswer) : choiceRows(agg, includeNoAnswer);
  const base = rows[0]?.base ?? 0;

  return (
    <>
      <QuestionChart rows={rows} chart={agg.qtype === "multi_select" ? "hbar" : section.chart} labelMode={labelMode} />
      {agg.qtype === "multi_select" && agg.other_texts.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Other (specified) — {agg.other_texts.length}
          </summary>
          <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
            {agg.other_texts.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        {agg.qtype === "multi_select" ? (
          <>
            {agg.n_respondents.toLocaleString()} answered · {agg.none_selected.toLocaleString()} selected nothing ·{" "}
            {agg.avg_selections.toFixed(1)} picks each on average
            {labelMode === "percent" && " · shares are per respondent"}
          </>
        ) : (
          <>
            {agg.n_answered.toLocaleString()} answered · {agg.no_answer.toLocaleString()} no answer
            {agg.qtype === "scale" && agg.mean != null && ` · mean ${agg.mean.toFixed(2)}`}
            {includeNoAnswer && base > 0 && ` · shares of all ${base.toLocaleString()} respondents`}
          </>
        )}
      </p>
    </>
  );
}

function FreeTextBody({
  agg,
  summary,
  textLoaded,
  textLoading,
  onWantText,
}: {
  agg: FreeTextAggregate;
  summary: string | null;
  textLoaded: boolean;
  textLoading: boolean;
  onWantText: () => void;
}) {
  const [open, setOpen] = useState(false);
  const themeRows: DisplayRow[] = agg.themes.map((t) => ({
    key: t.label,
    label: t.label,
    count: t.count,
    base: agg.n_answered,
    pct: agg.n_answered > 0 ? Math.round((t.count / agg.n_answered) * 1000) / 10 : 0,
    synthetic: false,
  }));

  return (
    <div className="space-y-3">
      {summary ? (
        <p className="whitespace-pre-line text-sm">{summary}</p>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          <MessageSquareText className="h-4 w-4 shrink-0" aria-hidden />
          Free-text question — run the analysis to summarise and theme the answers.
        </div>
      )}

      {themeRows.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Themes (app-counted, of {agg.n_answered.toLocaleString()} answers)
          </p>
          <RowsHBar rows={themeRows} labelMode="count" />
        </div>
      )}

      {agg.top_terms.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agg.top_terms.slice(0, 15).map((t) => (
            <Badge key={t.term} variant="outline" className="font-normal">
              {t.term} <span className="ml-1 text-muted-foreground">{t.count}</span>
            </Badge>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next && !textLoaded) onWantText();
          }}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          {open ? "Hide responses" : `Show responses (${agg.n_answered.toLocaleString()})`}
        </button>
        {open &&
          (textLoading && agg.responses.length === 0 ? (
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : agg.responses.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No responses to show.</p>
          ) : (
            <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-2 text-sm">
              {agg.responses.map((r) => (
                <li key={r.row_id} className="border-b pb-1.5 last:border-0 last:pb-0">
                  {r.text}
                </li>
              ))}
              {agg.truncated && (
                <li className="text-xs text-muted-foreground">Showing the first {agg.responses.length} responses.</li>
              )}
            </ul>
          ))}
      </div>

      <p className="border-t pt-2 text-xs text-muted-foreground">
        {agg.n_answered.toLocaleString()} answered · {agg.no_answer.toLocaleString()} no answer
        {agg.n_answered + agg.no_answer > 0 &&
          ` · ${formatPercent(agg.n_answered, agg.n_answered + agg.no_answer)} response rate`}
      </p>
    </div>
  );
}

function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}
