"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

type ImportType = "workers" | "employers" | "agreements" | "worksites";

interface ImportDialogProps {
  importType: ImportType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (result: ImportResult) => void;
}

interface ParsedSheet {
  name: string;
  rows: number;
  data: Record<string, unknown>[];
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

const FIELD_MAPS: Record<ImportType, { key: string; label: string; required?: boolean }[]> = {
  workers: [
    { key: "first_name", label: "First Name", required: true },
    { key: "last_name", label: "Last Name", required: true },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "occupation", label: "Occupation" },
    { key: "classification", label: "Classification" },
    { key: "member_number", label: "Member Number" },
    { key: "address", label: "Address" },
    { key: "suburb", label: "Suburb" },
    { key: "state", label: "State" },
    { key: "postcode", label: "Postcode" },
  ],
  employers: [
    { key: "employer_name", label: "Employer Name", required: true },
    { key: "trading_name", label: "Trading Name" },
    { key: "abn", label: "ABN" },
    { key: "employer_category", label: "Category" },
    { key: "parent_company", label: "Parent Company" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
  ],
  agreements: [
    { key: "decision_no", label: "Decision No.", required: true },
    { key: "agreement_name", label: "Agreement Name", required: true },
    { key: "short_name", label: "Short Name" },
    { key: "commencement_date", label: "Commencement Date" },
    { key: "expiry_date", label: "Expiry Date" },
    { key: "status", label: "Status" },
    { key: "industry_classification", label: "Industry Classification" },
  ],
  worksites: [
    { key: "worksite_name", label: "Worksite Name", required: true },
    { key: "worksite_type", label: "Type" },
    { key: "location_description", label: "Location" },
    { key: "basin", label: "Basin" },
    { key: "latitude", label: "Latitude" },
    { key: "longitude", label: "Longitude" },
  ],
};

const TABLE_NAMES: Record<ImportType, string> = {
  workers: "workers",
  employers: "employers",
  agreements: "agreements",
  worksites: "worksites",
};

export function ImportDialog({
  importType,
  open,
  onOpenChange,
  onComplete,
}: ImportDialogProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const fields = FIELD_MAPS[importType];
  const previewData = sheets[selectedSheet]?.data ?? [];
  const sourceColumns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  const resetState = useCallback(() => {
    setStep(1);
    setFile(null);
    setParsing(false);
    setParseError(null);
    setSheets([]);
    setSelectedSheet(0);
    setColumnMapping({});
    setImporting(false);
    setResult(null);
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setParseError(null);
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const json = await res.json();

      if (!json.success) {
        setParseError(json.error);
        setParsing(false);
        return;
      }

      if (json.fileType === "xlsx") {
        setSheets(json.sheets as ParsedSheet[]);
        autoMapColumns(json.sheets[0]?.data ?? []);
        setStep(2);
      } else {
        setParseError("PDF import preview is not yet supported. Please use an xlsx file.");
      }
    } catch {
      setParseError("Failed to parse the file. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  function autoMapColumns(data: Record<string, unknown>[]) {
    if (data.length === 0) return;
    const srcCols = Object.keys(data[0]);
    const mapping: Record<string, string> = {};

    for (const field of fields) {
      const match = srcCols.find(
        (col) =>
          col.toLowerCase().replace(/[\s_-]/g, "") ===
          field.key.toLowerCase().replace(/[\s_-]/g, "")
      );
      if (match) mapping[field.key] = match;
    }
    setColumnMapping(mapping);
  }

  const handleSheetChange = (idx: string) => {
    const i = parseInt(idx, 10);
    setSelectedSheet(i);
    autoMapColumns(sheets[i]?.data ?? []);
  };

  const handleImport = async () => {
    setImporting(true);
    const rows = sheets[selectedSheet]?.data ?? [];
    let created = 0;
    const errors: string[] = [];

    const mapped = rows.map((row) => {
      const record: Record<string, unknown> = {};
      for (const field of fields) {
        const srcCol = columnMapping[field.key];
        if (srcCol && row[srcCol] !== undefined && row[srcCol] !== null && row[srcCol] !== "") {
          record[field.key] = row[srcCol];
        }
      }
      return record;
    });

    const requiredFields = fields.filter((f) => f.required).map((f) => f.key);
    const valid = mapped.filter((record, idx) => {
      const missing = requiredFields.filter((k) => !record[k]);
      if (missing.length > 0) {
        errors.push(`Row ${idx + 1}: missing ${missing.join(", ")}`);
        return false;
      }
      return true;
    });

    const BATCH_SIZE = 100;
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const { error, data } = await supabase
        .from(TABLE_NAMES[importType])
        .insert(batch)
        .select();

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        created += data?.length ?? 0;
      }
    }

    await supabase.from("import_logs").insert({
      file_name: file?.name ?? "unknown",
      import_type: importType,
      records_created: created,
      records_updated: 0,
      errors: errors.length > 0 ? errors.slice(0, 10).join("; ") : null,
    });

    const importResult: ImportResult = { created, updated: 0, errors };
    setResult(importResult);
    setStep(4);
    setImporting(false);
    onComplete?.(importResult);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Import {importType.charAt(0).toUpperCase() + importType.slice(1)}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Upload an xlsx or pdf file to begin."}
            {step === 2 && "Preview the parsed data before mapping columns."}
            {step === 3 && "Map source columns to target fields."}
            {step === 4 && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={`h-0.5 w-8 ${
                    s < step ? "bg-primary/40" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {parsing ? (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mb-3" />
              ) : (
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              )}
              <p className="text-sm font-medium">
                {file ? file.name : "Click to upload or drag and drop"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .xlsx and .pdf files
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {parseError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {parseError}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {sheets.length > 1 && (
              <div className="space-y-1.5">
                <Label>Sheet</Label>
                <Select
                  value={selectedSheet.toString()}
                  onValueChange={handleSheetChange}
                >
                  <SelectTrigger className="w-[250px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheets.map((s, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        <FileSpreadsheet className="mr-2 inline h-3 w-3" />
                        {s.name} ({s.rows} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Showing first {Math.min(previewData.length, 10)} of{" "}
              {previewData.length} rows
            </div>

            <div className="overflow-auto rounded-md border max-h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {sourceColumns.map((col) => (
                      <TableHead key={col} className="whitespace-nowrap">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      {sourceColumns.map((col) => (
                        <TableCell key={col} className="whitespace-nowrap">
                          {row[col] != null ? String(row[col]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map each target field to a source column from your file.
            </p>
            <div className="space-y-3">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="flex items-center gap-3"
                >
                  <div className="w-[180px] text-sm font-medium flex items-center gap-1">
                    {field.label}
                    {field.required && (
                      <span className="text-destructive">*</span>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={columnMapping[field.key] ?? "__none__"}
                    onValueChange={(v) =>
                      setColumnMapping((prev) => ({
                        ...prev,
                        [field.key]: v === "__none__" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Skip this field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Skip —</SelectItem>
                      {sourceColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && result && (
          <div className="space-y-4 text-center py-4">
            {result.errors.length === 0 ? (
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            ) : (
              <AlertCircle className="h-12 w-12 text-amber-500 mx-auto" />
            )}
            <p className="text-lg font-medium">Import Complete</p>
            <div className="flex justify-center gap-4">
              <Badge variant="success" className="text-sm px-3 py-1">
                {result.created} created
              </Badge>
              {result.errors.length > 0 && (
                <Badge variant="warning" className="text-sm px-3 py-1">
                  {result.errors.length} errors
                </Badge>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="text-left rounded-md border p-3 max-h-[200px] overflow-auto">
                {result.errors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step > 1 && step < 4 && (
            <Button
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {step === 2 && (
            <Button onClick={() => setStep(3)}>
              Map Columns
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing
                ? `Importing ${previewData.length} rows...`
                : `Import ${previewData.length} rows`}
            </Button>
          )}
          {step === 4 && (
            <Button
              onClick={() => {
                resetState();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
