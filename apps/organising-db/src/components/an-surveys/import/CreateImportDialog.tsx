"use client";

/**
 * "New import" — two steps in one dialog.
 *
 *  1. Link the source: pick an Action Network form or survey (title, AN's
 *     own submission count, already-linked marker) or tick "No Action
 *     Network link" and type a title. When AN is not configured (503) the
 *     picker is replaced by a notice and the CSV-only path stays open.
 *  2. Upload the CSV for the import just created (UploadCsvStep), or skip.
 */

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import type { AnSurveyActionListItem, AnSurveySourceKind } from "@/lib/an-surveys/types";
import {
  AnSurveyApiError,
  describeAnSurveyError,
  useAnSurveyActions,
  useCreateAnSurvey,
} from "@/lib/hooks/useAnSurveys";
import { UploadCsvStep } from "./UploadCsvStep";

export interface CreateImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-links the import to this campaign (hidden from the user). */
  campaignId?: number | null;
  /** Fired when the wizard finishes (after upload or skip) with the new import's id. */
  onCreated: (importId: string) => void;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CreateImportDialog({ open, onOpenChange, campaignId, onCreated }: CreateImportDialogProps) {
  const [step, setStep] = useState<"link" | "upload">("link");
  const [sourceKind, setSourceKind] = useState<AnSurveySourceKind>("form");
  const [search, setSearch] = useState("");
  const [noLinkChoice, setNoLink] = useState(false);
  const [picked, setPicked] = useState<AnSurveyActionListItem | null>(null);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);
  const actions = useAnSurveyActions(sourceKind, debouncedSearch, open && step === "link" && !noLinkChoice);
  const anNotConfigured = actions.error instanceof AnSurveyApiError && actions.error.status === 503;
  // AN not configured → the only path is a CSV-only import.
  const noLink = noLinkChoice || anNotConfigured;

  const create = useCreateAnSurvey();

  const reset = () => {
    setStep("link");
    setSourceKind("form");
    setSearch("");
    setNoLink(false);
    setPicked(null);
    setTitle("");
    setTitleTouched(false);
    setCreatedId(null);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Closing mid-way after the entity exists still lands the user on it.
      if (createdId) onCreated(createdId);
      reset();
    }
    onOpenChange(next);
  };

  const pick = (action: AnSurveyActionListItem) => {
    setPicked(action);
    if (!titleTouched || !title.trim()) setTitle(action.title);
  };

  const effectiveTitle = title.trim();
  const canCreate = effectiveTitle.length > 0 && (noLink || picked != null) && !create.isPending;

  const handleCreate = async () => {
    setError(null);
    try {
      const imp = await create.mutateAsync({
        title: effectiveTitle,
        source_kind: picked?.resource_type ?? sourceKind,
        campaign_id: campaignId ?? null,
        an:
          !noLink && picked
            ? {
                resource_type: picked.resource_type,
                resource_id: picked.id,
                browser_url: picked.browser_url,
                total_records: picked.total_records,
              }
            : null,
      });
      setCreatedId(imp.id);
      setStep("upload");
    } catch (e) {
      setError(describeAnSurveyError(e, "Could not create the import"));
    }
  };

  const list = useMemo(() => actions.data?.actions ?? [], [actions.data]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{step === "link" ? "New import — link the source" : "New import — upload the CSV"}</DialogTitle>
          <DialogDescription>
            {step === "link"
              ? "Link an Action Network form or survey so the report can check its coverage, or import a CSV on its own."
              : "The response data comes from the report export you download from Action Network."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1 pr-1">
          {step === "link" && (
            <>
              {anNotConfigured ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  Action Network is not configured; you can still import a CSV without linking.
                </p>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={noLink} onCheckedChange={(v) => setNoLink(v === true)} />
                  No Action Network link — import a CSV only
                </label>
              )}

              {!noLink && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tabs value={sourceKind} onValueChange={(v) => setSourceKind(v as AnSurveySourceKind)}>
                      <TabsList>
                        <TabsTrigger value="form">Forms</TabsTrigger>
                        <TabsTrigger value="survey">Surveys</TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <div className="relative min-w-48 flex-1">
                      <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={`Search ${sourceKind === "form" ? "forms" : "surveys"}…`}
                        className="h-8 pl-7 text-xs"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => void actions.refetch()}
                      disabled={actions.isFetching}
                      aria-label="Refresh list"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", actions.isFetching && "animate-spin")} aria-hidden />
                    </Button>
                  </div>

                  {actions.isLoading ? (
                    <div className="flex items-center gap-2 rounded-md border border-dashed p-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading from Action Network…
                    </div>
                  ) : actions.isError ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                      {describeAnSurveyError(actions.error, "Could not reach Action Network")}
                    </p>
                  ) : list.length === 0 ? (
                    <p className="rounded-md border border-dashed p-6 text-xs text-muted-foreground">
                      No matching {sourceKind === "form" ? "forms" : "surveys"} found.
                    </p>
                  ) : (
                    <div role="listbox" aria-label="Action Network actions" className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      {list.map((action) => {
                        const selected = picked?.id === action.id && picked.resource_type === action.resource_type;
                        return (
                          <div
                            key={`${action.resource_type}:${action.id}`}
                            role="option"
                            aria-selected={selected}
                            tabIndex={0}
                            onClick={() => pick(action)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                pick(action);
                              }
                            }}
                            className={cn(
                              "flex cursor-pointer flex-wrap items-center gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50",
                              selected && "border-primary bg-primary/5"
                            )}
                          >
                            <div className="min-w-48 flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-medium">
                                <span className="truncate">{action.title}</span>
                                {action.browser_url && (
                                  <a
                                    href={action.browser_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label="Open in Action Network"
                                  >
                                    <ExternalLink className="h-3 w-3" aria-hidden />
                                  </a>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {action.created_date ? `created ${action.created_date.slice(0, 10)}` : ""}
                                {action.total_records != null
                                  ? `${action.created_date ? " · " : ""}${action.total_records.toLocaleString()} submission${action.total_records === 1 ? "" : "s"} in AN`
                                  : ""}
                              </div>
                            </div>
                            {action.linked_import_id && (
                              <Badge variant="secondary" className="text-[10px]" title={action.linked_import_title ?? undefined}>
                                Already linked{action.linked_import_title ? `: ${action.linked_import_title}` : ""}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="an-survey-title">Title</Label>
                <Input
                  id="an-survey-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                  }}
                  placeholder={noLink ? "e.g. ROV roles — register your interest" : "Prefilled from the selected action"}
                />
              </div>
            </>
          )}

          {step === "upload" && createdId && (
            <UploadCsvStep
              importId={createdId}
              mode="first"
              onDone={() => {
                const id = createdId;
                reset();
                onOpenChange(false);
                onCreated(id);
              }}
              onSkip={() => {
                const id = createdId;
                reset();
                onOpenChange(false);
                onCreated(id);
              }}
            />
          )}
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {step === "link" && (
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canCreate} onClick={() => void handleCreate()}>
              {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
              Create and upload CSV
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
