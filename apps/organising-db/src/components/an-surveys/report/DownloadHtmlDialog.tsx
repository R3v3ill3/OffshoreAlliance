"use client";

/**
 * Download the self-contained HTML report. Verbatim free-text responses are
 * OFF by default: the file leaves the app and those are members' own words.
 */

import { useState } from "react";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
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
import { API_FETCH_TIMEOUT_UPLOAD_MS, fetchApi } from "@/lib/api/fetch-api";
import { AnSurveyApiError, describeAnSurveyError } from "@/lib/hooks/useAnSurveys";

export interface DownloadHtmlDialogProps {
  importId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "survey-report"
  );
}

/** Pull the filename the route set, if any; otherwise build one. */
function fileNameFrom(res: Response, fallbackTitle: string): string {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return `${slug(fallbackTitle)}-${new Date().toISOString().slice(0, 10)}.html`;
}

export function DownloadHtmlDialog({ importId, title, open, onOpenChange }: DownloadHtmlDialogProps) {
  const [includeText, setIncludeText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchApi(
        `/api/an-surveys/${encodeURIComponent(importId)}/report/html?includeText=${includeText ? "1" : "0"}`,
        { timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new AnSurveyApiError(body?.error ?? "Could not build the HTML report", res.status);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res, title);
      a.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
      setIncludeText(false);
    } catch (e) {
      setError(describeAnSurveyError(e, "Download failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setIncludeText(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download HTML report</DialogTitle>
          <DialogDescription>
            A single file with the headline figures, the narrative, every chart and table, and the AI summary of each
            free-text question. Opens in any browser, no app access needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-md border p-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={includeText}
              onCheckedChange={(v) => setIncludeText(v === true)}
              className="mt-0.5"
              disabled={busy}
            />
            <span>
              <span className="font-medium">Include verbatim free-text responses</span>
              <span className="mt-0.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Leaves the app; contains members&apos; own words. Names and contact details are scrubbed, but a
                comment can still identify someone.
              </span>
            </span>
          </label>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void download()} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
