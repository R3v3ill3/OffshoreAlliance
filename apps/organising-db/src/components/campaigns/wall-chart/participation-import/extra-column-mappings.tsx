"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EXTRA_MATCH_MODES, cellContainsToken, isTruthyCell } from "@/lib/import/participation-import-shared";
import { useWallChartAssessmentOptions } from "../assessment-selector";
import { RatingTargetSelect } from "./rating-target-select";
import type { ExtraColumnMapping } from "./types";
import { newExtraColumnMapping } from "./types";
import { extraMappingStatus } from "./use-participation-import";
import { useCampaignDataFields } from "@/lib/hooks/useCampaignDataFields";
import type { ParticipationImportController } from "./use-participation-import";

const NONE = "__none__";
const DEST_NEW = "new";
const DEST_EXISTING = "existing";
const DEST_CONTACT = "contact";
const DEST_FACT = "fact";
const MAX_EXTRAS = 8;

function distinctValueMappings(
  rows: Record<string, string>[],
  column: string
): ExtraColumnMapping["valueMappings"] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = (row[column] ?? "").trim();
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([rawValue, count]) => ({
      rawValue,
      count,
      target: rawValue === "" ? { kind: "ignore" as const } : { kind: "ignore" as const },
    }));
}

function matchCount(
  rows: Record<string, string>[],
  mapping: ExtraColumnMapping
): number | null {
  if (!mapping.column) return null;
  let n = 0;
  for (const row of rows) {
    const raw = (row[mapping.column] ?? "").trim();
    if (mapping.matchMode === "truthy") {
      if (isTruthyCell(raw)) n += 1;
    } else if (mapping.matchMode === "contains") {
      if (cellContainsToken(raw, mapping.containsToken)) n += 1;
    } else if (mapping.destination.kind === "fact") {
      if (raw.length > 0) n += 1;
    } else {
      const mapped = mapping.valueMappings.find((m) => m.rawValue === raw);
      if (mapped && mapped.target.kind !== "ignore") n += 1;
    }
  }
  return n;
}

/**
 * CSV-only extra mappings: other question columns → another assessment,
 * or a guarded Contact union-role promotion.
 */
export function ExtraColumnMappings({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const { source, assessment, extraMappings, setExtraMappings } = controller;
  const { data: options = [] } = useWallChartAssessmentOptions(campaignId);
  const { data: dataFieldsCat } = useCampaignDataFields(campaignId);
  const dataFields = dataFieldsCat?.fields ?? [];
  if (!source || source.kind !== "csv") return null;

  const headers = source.csv.headers;
  const rows = source.csv.rows;
  const primaryExistingId =
    assessment?.mode === "existing" ? assessment.option.activity_id : null;
  const contactTaken = extraMappings.some((m) => m.destination.kind === "contact_role");

  function patch(id: string, next: ExtraColumnMapping) {
    setExtraMappings(extraMappings.map((m) => (m.id === id ? next : m)));
  }

  function setColumn(mapping: ExtraColumnMapping, column: string | null) {
    const valueMappings =
      column && mapping.matchMode === "exact" ? distinctValueMappings(rows, column) : mapping.valueMappings;
    patch(mapping.id, { ...mapping, column, valueMappings });
  }

  function setMatchMode(mapping: ExtraColumnMapping, matchMode: ExtraColumnMapping["matchMode"]) {
    const valueMappings =
      matchMode === "exact" && mapping.column
        ? distinctValueMappings(rows, mapping.column)
        : mapping.valueMappings;
    patch(mapping.id, { ...mapping, matchMode, valueMappings });
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Additional column mappings</h3>
        <p className="text-xs text-muted-foreground">
          Optional. Map other question columns onto more assessments, campaign
          data fields (claim ranks, compliance witnesses — not wall-chart
          colour), or promote matching workers to union role Contact — skipped
          if they are already Contact, Activist, or Delegate.
        </p>
      </div>

      {extraMappings.map((mapping, index) => {
        const status = extraMappingStatus(mapping);
        const hits = matchCount(rows, mapping);
        const destKind =
          mapping.destination.kind === "contact_role"
            ? DEST_CONTACT
            : mapping.destination.kind === "fact"
              ? DEST_FACT
              : mapping.destination.assessment.mode === "existing"
                ? DEST_EXISTING
                : DEST_NEW;
        const destAssessment =
          mapping.destination.kind === "assessment" ? mapping.destination.assessment : null;
        const isBinary =
          destAssessment?.mode === "existing"
            ? destAssessment.option.is_binary
            : (destAssessment?.isBinary ?? true);
        const ratingLabels =
          destAssessment?.mode === "existing" ? destAssessment.option.rating_labels : null;

        return (
          <div key={mapping.id} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold">Mapping {index + 1}</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setExtraMappings(extraMappings.filter((m) => m.id !== mapping.id))}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Source column</Label>
                <Select
                  value={mapping.column ?? NONE}
                  onValueChange={(v) => setColumn(mapping, v === NONE ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE} className="text-xs">
                      — choose a column —
                    </SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h} className="text-xs">
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">When the cell matches</Label>
                <Select
                  value={mapping.matchMode}
                  onValueChange={(v) => setMatchMode(mapping, v as ExtraColumnMapping["matchMode"])}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXTRA_MATCH_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {EXTRA_MATCH_MODES.find((m) => m.value === mapping.matchMode)?.help}
                </p>
              </div>
            </div>

            {mapping.matchMode === "contains" && (
              <div className="space-y-1">
                <Label className="text-xs">Contains</Label>
                <Input
                  className="h-8 text-xs"
                  value={mapping.containsToken}
                  placeholder='e.g. ask others to join'
                  onChange={(e) => patch(mapping.id, { ...mapping, containsToken: e.target.value })}
                />
              </div>
            )}

            {mapping.destination.kind === "fact" && mapping.matchMode === "exact" && (
              <p className="text-[11px] text-muted-foreground">
                Non-empty cells write the cell value to the data field. They do
                not record an assessment.
              </p>
            )}

            {mapping.matchMode === "exact" && mapping.column && mapping.destination.kind !== "fact" && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="p-2 font-medium">Answer value</th>
                      <th className="p-2 font-medium">Rows</th>
                      <th className="p-2 font-medium">
                        {mapping.destination.kind === "contact_role" ? "Promote?" : "Record as"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.valueMappings.map((vm, vi) => (
                      <tr key={`${mapping.id}-${vm.rawValue}`} className="border-b last:border-0">
                        <td className="max-w-56 truncate p-2" title={vm.rawValue}>
                          {vm.rawValue === "" ? (
                            <em className="text-muted-foreground">(blank)</em>
                          ) : (
                            vm.rawValue
                          )}
                        </td>
                        <td className="p-2 tabular-nums">{vm.count}</td>
                        <td className="p-2">
                          {mapping.destination.kind === "contact_role" ? (
                            <Select
                              value={vm.target.kind === "ignore" ? "ignore" : "promote"}
                              onValueChange={(v) => {
                                const next = [...mapping.valueMappings];
                                next[vi] = {
                                  ...vm,
                                  target:
                                    v === "promote"
                                      ? { kind: "binary", value: "yes" }
                                      : { kind: "ignore" },
                                };
                                patch(mapping.id, { ...mapping, valueMappings: next });
                              }}
                            >
                              <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ignore" className="text-xs">
                                  Don&apos;t promote
                                </SelectItem>
                                <SelectItem value="promote" className="text-xs">
                                  Promote to Contact
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <RatingTargetSelect
                              value={vm.target}
                              onChange={(target) => {
                                const next = [...mapping.valueMappings];
                                next[vi] = { ...vm, target };
                                patch(mapping.id, { ...mapping, valueMappings: next });
                              }}
                              isBinary={isBinary}
                              ratingLabels={ratingLabels}
                              allowIgnore
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Write to</Label>
              <Select
                value={destKind}
                onValueChange={(v) => {
                  if (v === DEST_CONTACT) {
                    patch(mapping.id, { ...mapping, destination: { kind: "contact_role" } });
                    return;
                  }
                  if (v === DEST_FACT) {
                    const first = dataFields[0];
                    if (!first) return;
                    patch(mapping.id, {
                      ...mapping,
                      destination: { kind: "fact", field_id: first.field_id },
                    });
                    return;
                  }
                  if (v === DEST_EXISTING) {
                    const first = options.find((o) => o.activity_id !== primaryExistingId);
                    if (!first) return;
                    patch(mapping.id, {
                      ...mapping,
                      destination: { kind: "assessment", assessment: { mode: "existing", option: first } },
                    });
                    return;
                  }
                  patch(mapping.id, {
                    ...mapping,
                    destination: {
                      kind: "assessment",
                      assessment: {
                        mode: "new",
                        title: mapping.column ? `${mapping.column}` : "",
                        isBinary: true,
                        supporterOutcomeValue: "yes",
                      },
                    },
                  });
                }}
              >
                <SelectTrigger className="h-8 max-w-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEST_NEW} className="text-xs">
                    New assessment
                  </SelectItem>
                  <SelectItem
                    value={DEST_EXISTING}
                    className="text-xs"
                    disabled={options.filter((o) => o.activity_id !== primaryExistingId).length === 0}
                  >
                    Existing assessment
                  </SelectItem>
                  <SelectItem
                    value={DEST_CONTACT}
                    className="text-xs"
                    disabled={contactTaken && mapping.destination.kind !== "contact_role"}
                  >
                    Union role — Contact (guarded)
                  </SelectItem>
                  <SelectItem
                    value={DEST_FACT}
                    className="text-xs"
                    disabled={dataFields.length === 0}
                  >
                    Data field (not an assessment)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mapping.destination.kind === "fact" && (
              <div className="space-y-1">
                <Label className="text-xs">Data field</Label>
                <Select
                  value={String(mapping.destination.field_id)}
                  onValueChange={(v) =>
                    patch(mapping.id, {
                      ...mapping,
                      destination: { kind: "fact", field_id: Number(v) },
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dataFields.map((f) => (
                      <SelectItem key={f.field_id} value={String(f.field_id)} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Matching cells write this fact. They do not colour the wall chart.
                </p>
              </div>
            )}

            {destAssessment?.mode === "new" && mapping.destination.kind === "assessment" && (
              <div className="space-y-2 pl-1">
                <div className="space-y-1">
                  <Label className="text-xs">Assessment title</Label>
                  <Input
                    className="h-8 text-xs"
                    value={destAssessment.title}
                    placeholder="e.g. Ask others to join"
                    onChange={(e) =>
                      patch(mapping.id, {
                        ...mapping,
                        destination: {
                          kind: "assessment",
                          assessment: { ...destAssessment, title: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id={`extra-binary-${mapping.id}`}
                    checked={destAssessment.isBinary}
                    onCheckedChange={(checked) =>
                      patch(mapping.id, {
                        ...mapping,
                        destination: {
                          kind: "assessment",
                          assessment: { ...destAssessment, isBinary: checked },
                        },
                        matchedTarget: checked
                          ? { kind: "binary", value: "yes" }
                          : { kind: "rating", rating: 2 },
                      })
                    }
                  />
                  <Label htmlFor={`extra-binary-${mapping.id}`} className="text-xs font-normal">
                    Binary (yes / no)
                  </Label>
                </div>
              </div>
            )}

            {destAssessment?.mode === "existing" && mapping.destination.kind === "assessment" && (
              <Select
                value={String(destAssessment.option.activity_id)}
                onValueChange={(v) => {
                  const option = options.find((o) => o.activity_id === Number(v));
                  if (!option) return;
                  patch(mapping.id, {
                    ...mapping,
                    destination: { kind: "assessment", assessment: { mode: "existing", option } },
                    matchedTarget: option.is_binary
                      ? { kind: "binary", value: option.supporter_outcome_value ?? "yes" }
                      : { kind: "rating", rating: 2 },
                  });
                }}
              >
                <SelectTrigger className="h-8 max-w-md text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem
                      key={o.activity_id}
                      value={String(o.activity_id)}
                      className="text-xs"
                      disabled={o.activity_id === primaryExistingId}
                    >
                      {o.title}
                      {o.is_binary ? " (yes/no)" : " (1–5)"}
                      {o.activity_id === primaryExistingId ? " — participation assessment" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {mapping.destination.kind === "assessment" && mapping.matchMode !== "exact" && (
              <div className="flex items-center gap-3">
                <Label className="text-xs">Record matches as</Label>
                <RatingTargetSelect
                  value={mapping.matchedTarget}
                  onChange={(matchedTarget) => patch(mapping.id, { ...mapping, matchedTarget })}
                  isBinary={isBinary}
                  ratingLabels={ratingLabels}
                />
              </div>
            )}

            {mapping.destination.kind === "contact_role" && (
              <p className="text-xs text-muted-foreground">
                Matching workers are set to Contact only if they do not already
                hold Contact, Activist, or Delegate. This is a global union role,
                so it applies across campaigns. The Activist Register may pick
                them up automatically.
              </p>
            )}

            {hits != null && mapping.column && (
              <p className="text-xs text-muted-foreground">
                {hits} row{hits === 1 ? "" : "s"} in this file currently match.
              </p>
            )}
            {status === "incomplete" && (
              <p className="text-xs text-destructive">Finish this mapping or remove it to continue.</p>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={extraMappings.length >= MAX_EXTRAS}
        onClick={() => setExtraMappings([...extraMappings, newExtraColumnMapping()])}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add column mapping
      </Button>
    </section>
  );
}
