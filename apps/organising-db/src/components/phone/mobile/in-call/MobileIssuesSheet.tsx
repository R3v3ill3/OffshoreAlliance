"use client";

import { useState } from "react";
import { Flame, Plus, X } from "lucide-react";
import { MobileBottomSheet } from "@/components/phone/mobile/primitives/MobileBottomSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExpectedIssueRow } from "@/lib/phone/session/types";
import type { CapturedIssue } from "@/lib/phone/call-flow-state";

type Heat = 1 | 2 | 3 | 4 | 5;

const HEAT_PRESETS: { value: Heat; label: string; tone: string }[] = [
  { value: 1, label: "Cool", tone: "bg-blue-100 text-blue-800" },
  { value: 2, label: "Mild", tone: "bg-cyan-100 text-cyan-800" },
  { value: 3, label: "Warm", tone: "bg-amber-100 text-amber-800" },
  { value: 4, label: "Hot", tone: "bg-orange-100 text-orange-800" },
  { value: 5, label: "Boiling", tone: "bg-rose-100 text-rose-800" },
];

interface MobileIssuesSheetProps {
  open: boolean;
  onClose: () => void;
  expected: ExpectedIssueRow[];
  captured: CapturedIssue[];
  onAdd: (issue: CapturedIssue) => void;
  onUpdate: (index: number, issue: CapturedIssue) => void;
  onRemove: (index: number) => void;
}

export function MobileIssuesSheet({
  open,
  onClose,
  expected,
  captured,
  onAdd,
  onUpdate,
  onRemove,
}: MobileIssuesSheetProps) {
  const [customLabel, setCustomLabel] = useState("");
  const [customHeat, setCustomHeat] = useState<Heat>(3);

  const capturedExpectedIndexes = new Set(
    captured
      .map((c) => c.source_top_issue_index)
      .filter((idx): idx is number => idx != null && idx >= 0),
  );

  function addFromExpected(row: ExpectedIssueRow) {
    if (capturedExpectedIndexes.has(row.index)) return;
    onAdd({
      issue_label: row.label,
      heat: (row.heat as Heat) ?? 3,
      source_top_issue_index: row.index,
    });
  }

  function addCustom() {
    if (!customLabel.trim()) return;
    onAdd({
      issue_label: customLabel.trim(),
      heat: customHeat,
      source_top_issue_index: null,
    });
    setCustomLabel("");
    setCustomHeat(3);
  }

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title="Issues raised"
      description="Track what the worker cares about — even briefly mentioned issues should be logged with a heat rating."
    >
      <div className="space-y-4 pb-4">
        {captured.length > 0 ? (
          <ul className="space-y-2">
            {captured.map((entry, index) => (
              <li key={index} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <Flame className="mr-1 inline h-3.5 w-3.5 text-rose-500" />
                      {entry.issue_label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove issue"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {HEAT_PRESETS.map((preset) => {
                    const selected = entry.heat === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => onUpdate(index, { ...entry, heat: preset.value })}
                        aria-pressed={selected}
                        className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium ${
                          selected ? preset.tone : "border-muted-foreground/20 bg-background"
                        }`}
                      >
                        {preset.value} · {preset.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            No issues logged yet.
          </p>
        )}

        {expected.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Expected issues for this campaign
            </p>
            <div className="flex flex-wrap gap-1.5">
              {expected.map((row) => {
                const already = capturedExpectedIndexes.has(row.index);
                return (
                  <button
                    key={row.index}
                    type="button"
                    onClick={() => addFromExpected(row)}
                    disabled={already}
                    className={`inline-flex h-10 items-center rounded-full border px-3 text-sm font-medium ${
                      already
                        ? "cursor-default border-slate-200 bg-slate-50 text-slate-400"
                        : "border-muted-foreground/20 bg-background hover:bg-muted"
                    }`}
                  >
                    {row.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Add custom issue
          </p>
          <Input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="Describe the issue (e.g. EBA expiry, rostering)"
            className="h-11"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {HEAT_PRESETS.map((preset) => {
              const selected = customHeat === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCustomHeat(preset.value)}
                  aria-pressed={selected}
                  className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium ${
                    selected ? preset.tone : "border-muted-foreground/20 bg-background"
                  }`}
                >
                  {preset.value} · {preset.label}
                </button>
              );
            })}
            <Button
              type="button"
              onClick={addCustom}
              disabled={!customLabel.trim()}
              className="ml-auto h-10 px-3"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
