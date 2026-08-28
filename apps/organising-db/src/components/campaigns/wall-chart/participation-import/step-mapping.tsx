"use client";

import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ParticipationMappableField } from "@/lib/import/participation-import-shared";
import { RatingTargetSelect } from "./rating-target-select";
import { ExtraColumnMappings } from "./extra-column-mappings";
import type { ParticipationImportController } from "./use-participation-import";

const NONE = "__none__";

const IDENTITY_FIELDS: { field: ParticipationMappableField; label: string }[] = [
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone / mobile" },
  { field: "first_name", label: "First name" },
  { field: "last_name", label: "Last name" },
  { field: "full_name", label: "Full name (single column)" },
];

/**
 * Step 3 — map identity columns, choose the response column and map its
 * values to ratings, and set the import options.
 */
export function StepMapping({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const {
    source,
    assessment,
    columnMap,
    setColumnMap,
    responseColumn,
    selectResponseColumn,
    valueMappings,
    setValueMappings,
    fixedTarget,
    setFixedTarget,
    conflictPolicy,
    setConflictPolicy,
    nonResponders,
    setNonResponders,
    effectiveRows,
    importRows,
  } = controller;

  const headers = source?.kind === "csv" ? source.csv.headers : [];
  const isBinary =
    assessment?.mode === "existing" ? assessment.option.is_binary : (assessment?.isBinary ?? true);
  const ratingLabels =
    assessment?.mode === "existing" ? assessment.option.rating_labels : null;

  const identityOk = useMemo(() => {
    return Boolean(
      columnMap.email ||
        columnMap.phone ||
        columnMap.full_name ||
        (columnMap.first_name && columnMap.last_name)
    );
  }, [columnMap]);

  const ignoredCount = importRows.length - effectiveRows.length;

  function setField(field: ParticipationMappableField, header: string | null) {
    setColumnMap({ ...columnMap, [field]: header ?? undefined });
  }

  // AN sync mode: no columns to map — just the recorded value + options.
  if (source?.kind === "an") {
    return (
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Participation value</h3>
          <p className="text-xs text-muted-foreground">
            {importRows.length} participant{importRows.length === 1 ? "" : "s"} from
            “{source.action.title}” will be recorded as:
          </p>
          <RatingTargetSelect
            value={fixedTarget}
            onChange={setFixedTarget}
            isBinary={isBinary}
            ratingLabels={ratingLabels}
          />
        </section>
        <ImportOptions
          conflictPolicy={conflictPolicy}
          setConflictPolicy={setConflictPolicy}
          nonResponders={nonResponders}
          setNonResponders={setNonResponders}
          isBinary={isBinary}
          ratingLabels={ratingLabels}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Identity columns ── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Worker identity columns</h3>
        <p className="text-xs text-muted-foreground">
          Used to match rows to worker records (email first, then phone, then
          name). At least email, phone, or a name is required.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {IDENTITY_FIELDS.map(({ field, label }) => (
            <div key={field} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Select
                value={columnMap[field] ?? NONE}
                onValueChange={(v) => setField(field, v === NONE ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} className="text-xs">
                    — not in file —
                  </SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {!identityOk && (
          <p className="text-xs text-destructive">
            Map at least an email, phone, or name column to continue.
          </p>
        )}
      </section>

      {/* ── Response mapping ── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Participation assessment</h3>
        <div className="space-y-1">
          <Label className="text-xs">Response / answer column</Label>
          <Select
            value={responseColumn ?? NONE}
            onValueChange={(v) => selectResponseColumn(v === NONE ? null : v)}
          >
            <SelectTrigger className="h-8 w-full max-w-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs">
                — none — record the same value for every row
              </SelectItem>
              {headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {responseColumn ? (
          <div className="rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2 font-medium">Answer value</th>
                  <th className="p-2 font-medium">Rows</th>
                  <th className="p-2 font-medium">Record as</th>
                </tr>
              </thead>
              <tbody>
                {valueMappings.map((m, i) => (
                  <tr key={m.rawValue} className="border-b last:border-0">
                    <td className="max-w-56 truncate p-2" title={m.rawValue}>
                      {m.rawValue === "" ? (
                        <em className="text-muted-foreground">(blank)</em>
                      ) : (
                        m.rawValue
                      )}
                    </td>
                    <td className="p-2 tabular-nums">{m.count}</td>
                    <td className="p-2">
                      <RatingTargetSelect
                        value={m.target}
                        onChange={(target) => {
                          const next = [...valueMappings];
                          next[i] = { ...m, target };
                          setValueMappings(next);
                        }}
                        isBinary={isBinary}
                        ratingLabels={ratingLabels}
                        allowIgnore
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Label className="text-xs">Record every row as</Label>
            <RatingTargetSelect
              value={fixedTarget}
              onChange={setFixedTarget}
              isBinary={isBinary}
              ratingLabels={ratingLabels}
            />
          </div>
        )}
        {ignoredCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {ignoredCount} row{ignoredCount === 1 ? "" : "s"} will not be imported
            (no identity match, or no value to write). {effectiveRows.length} will be recorded.
          </p>
        )}
      </section>

      <ExtraColumnMappings campaignId={campaignId} controller={controller} />

      <ImportOptions
        conflictPolicy={conflictPolicy}
        setConflictPolicy={setConflictPolicy}
        nonResponders={nonResponders}
        setNonResponders={setNonResponders}
        isBinary={isBinary}
        ratingLabels={ratingLabels}
      />
    </div>
  );
}

function ImportOptions({
  conflictPolicy,
  setConflictPolicy,
  nonResponders,
  setNonResponders,
  isBinary,
  ratingLabels,
}: {
  conflictPolicy: "overwrite" | "fill_blanks";
  setConflictPolicy: (v: "overwrite" | "fill_blanks") => void;
  nonResponders: ParticipationImportController["nonResponders"];
  setNonResponders: ParticipationImportController["setNonResponders"];
  isBinary: boolean;
  ratingLabels: Record<string, string> | null;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Options</h3>
      <div className="space-y-1">
        <Label className="text-xs">
          If a worker already has an entry on this assessment
        </Label>
        <RadioGroup
          value={conflictPolicy}
          onValueChange={(v) => setConflictPolicy(v as "overwrite" | "fill_blanks")}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="overwrite" id="cp-overwrite" />
            <Label htmlFor="cp-overwrite" className="text-xs font-normal">
              Update it with the imported value (conflicts listed before applying)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="fill_blanks" id="cp-fill" />
            <Label htmlFor="cp-fill" className="text-xs font-normal">
              Keep the existing entry — only fill blanks
            </Label>
          </div>
        </RadioGroup>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="opt-nonresponders"
            checked={nonResponders.enabled}
            onCheckedChange={(checked) =>
              setNonResponders({ ...nonResponders, enabled: checked === true })
            }
          />
          <Label htmlFor="opt-nonresponders" className="text-xs font-normal">
            Also record a value for workforce members <strong>not</strong> in this
            import (never overwrites an existing entry)
          </Label>
        </div>
        {nonResponders.enabled && (
          <div className="flex items-center gap-3 pl-6">
            <Label className="text-xs">Record non-responders as</Label>
            <RatingTargetSelect
              value={nonResponders.target}
              onChange={(target) => setNonResponders({ ...nonResponders, target })}
              isBinary={isBinary}
              ratingLabels={ratingLabels}
            />
          </div>
        )}
      </div>
    </section>
  );
}
