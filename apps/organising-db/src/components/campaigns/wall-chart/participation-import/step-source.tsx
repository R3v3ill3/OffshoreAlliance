"use client";

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ParticipationImportController } from "./use-participation-import";

/**
 * Step 1 — pick the source. Phase 1 ships the Action Network report
 * (CSV/XLSX) upload; Phase 2 adds "Sync from Action Network" alongside it.
 */
export function StepSource({ controller }: { controller: ParticipationImportController }) {
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
