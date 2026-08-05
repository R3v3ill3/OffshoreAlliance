"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileSpreadsheet, Loader2, RefreshCw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import { fetchApi } from "@/lib/api/fetch-api";
import type {
  AnActionListItem,
  AnActionsResponse,
} from "@/lib/import/participation-import-shared";
import type { ParticipationImportController } from "./use-participation-import";

const TYPE_LABELS: Record<AnActionListItem["resource_type"], string> = {
  form: "Form",
  survey: "Survey",
  petition: "Petition",
  event: "Event",
};

/**
 * Step 1 — pick the source: sync who-participated straight from Action
 * Network, or upload an AN report export (needed to map answer values).
 */
export function StepSource({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  return (
    <Tabs defaultValue="an" className="space-y-3">
      <TabsList>
        <TabsTrigger value="an">Sync from Action Network</TabsTrigger>
        <TabsTrigger value="csv">Upload report (CSV)</TabsTrigger>
      </TabsList>
      <TabsContent value="an">
        <AnBrowse campaignId={campaignId} controller={controller} />
      </TabsContent>
      <TabsContent value="csv">
        <CsvUpload controller={controller} />
      </TabsContent>
    </Tabs>
  );
}

function AnBrowse({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const { loadAnAction, busy, anProgress } = controller;
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["an-actions", campaignId],
    queryFn: async (): Promise<AnActionsResponse> => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/an-actions`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Could not list Action Network actions");
      return json;
    },
    staleTime: 60_000,
  });

  const q = search.trim().toLowerCase();
  const actions = (data?.actions ?? []).filter(
    (a) => !q || a.title.toLowerCase().includes(q)
  );

  if (anProgress) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        {anProgress}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick a form, survey, petition or event — everyone who completed it is
        marked as having participated. To map answer values to ratings, use
        the report upload instead.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions…"
          className="h-8 max-w-sm text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh list"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading actions from Action Network…
        </div>
      ) : isError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error instanceof Error ? error.message : "Could not reach Action Network"}
        </p>
      ) : actions.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-xs text-muted-foreground">
          No matching actions found.
        </p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {actions.map((action) => (
            <div
              key={`${action.resource_type}:${action.id}`}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2"
            >
              <div className="min-w-48 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{action.title}</span>
                  {action.browser_url && (
                    <a
                      href={action.browser_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Open in Action Network"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {TYPE_LABELS[action.resource_type]}
                  {action.created_date
                    ? ` · created ${action.created_date.slice(0, 10)}`
                    : ""}
                  {action.total_records != null
                    ? ` · ${action.total_records} participant${action.total_records === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              {action.linked_activity_id != null && (
                <Badge variant="secondary" className="text-[10px]">
                  Linked: {action.linked_activity_title}
                </Badge>
              )}
              <Button
                type="button"
                size="sm"
                variant={action.linked_activity_id != null ? "default" : "outline"}
                className="h-7 text-xs"
                disabled={busy}
                onClick={() => void loadAnAction(action)}
              >
                {action.linked_activity_id != null ? "Re-sync" : "Import"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CsvUpload({ controller }: { controller: ParticipationImportController }) {
  const { uploadFile, busy } = controller;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void uploadFile(file);
    },
    [uploadFile]
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Upload a report exported from Action Network (CSV or Excel). The report
        should include the workers&apos; email and/or mobile columns, plus one
        column per question if you want to map answers to ratings.
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
          busy && "pointer-events-none opacity-60"
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="text-sm font-medium">
          {busy ? "Reading file…" : "Drop the Action Network report here"}
        </div>
        <div className="text-xs text-muted-foreground">
          or click to browse — .csv, .xlsx or .xls
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          In Action Network: open the action → <em>Reports</em> → download the
          CSV. Question answers are only included in report exports — the AN
          API alone can&apos;t provide them.
        </span>
      </div>
    </div>
  );
}
