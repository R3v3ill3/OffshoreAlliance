"use client";

import { useState } from "react";
import { Plus, ShieldAlert, X } from "lucide-react";
import { MobileBottomSheet } from "@/components/phone/mobile/primitives/MobileBottomSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ObjectionBankRow } from "@/lib/phone/session/types";
import type { CapturedObjection } from "@/lib/phone/call-flow-state";

type ObjectionOutcome = CapturedObjection["outcome"];

const OUTCOME_OPTIONS: { value: ObjectionOutcome; label: string; tone: string }[] = [
  { value: "fully_resolved", label: "Resolved", tone: "bg-emerald-100 text-emerald-800" },
  { value: "partially_resolved", label: "Partial", tone: "bg-amber-100 text-amber-800" },
  { value: "not_resolved", label: "Unresolved", tone: "bg-rose-100 text-rose-800" },
];

interface MobileObjectionsSheetProps {
  open: boolean;
  onClose: () => void;
  bank: ObjectionBankRow[];
  captured: CapturedObjection[];
  onAdd: (objection: CapturedObjection) => void;
  onUpdate: (index: number, objection: CapturedObjection) => void;
  onRemove: (index: number) => void;
}

/**
 * Mobile bottom-sheet for capturing objections raised during the call.
 * Pre-loaded with the campaign objection bank (passed in via bootstrap)
 * plus a free-text path for ad-hoc objections. Each captured objection
 * has a 3-way resolution chip (resolved / partial / unresolved).
 */
export function MobileObjectionsSheet({
  open,
  onClose,
  bank,
  captured,
  onAdd,
  onUpdate,
  onRemove,
}: MobileObjectionsSheetProps) {
  const [customLabel, setCustomLabel] = useState("");
  const capturedIds = new Set(
    captured.map((c) => c.objection_id).filter((id): id is number => id != null),
  );

  function addFromBank(row: ObjectionBankRow) {
    if (capturedIds.has(row.objection_id)) return;
    onAdd({ objection_id: row.objection_id, custom_label: row.label, outcome: "not_resolved" });
  }

  function addCustom() {
    if (!customLabel.trim()) return;
    onAdd({ objection_id: null, custom_label: customLabel.trim(), outcome: "not_resolved" });
    setCustomLabel("");
  }

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      title="Objections"
      description="Log objections raised during this call. Tap to add, then set resolution."
    >
      <div className="space-y-4 pb-4">
        {captured.length > 0 ? (
          <ul className="space-y-2">
            {captured.map((entry, index) => (
              <li key={index} className="rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                      {entry.custom_label ?? `Objection #${entry.objection_id}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove objection"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {OUTCOME_OPTIONS.map((option) => {
                    const selected = entry.outcome === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onUpdate(index, { ...entry, outcome: option.value })}
                        aria-pressed={selected}
                        className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium ${
                          selected ? option.tone : "border-muted-foreground/20 bg-background"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-3 text-center text-sm text-muted-foreground">
            No objections yet. Tap a chip below to log one.
          </p>
        )}

        {bank.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Quick add
            </p>
            <div className="flex flex-wrap gap-1.5">
              {bank.map((row) => {
                const already = capturedIds.has(row.objection_id);
                return (
                  <button
                    key={row.objection_id}
                    type="button"
                    onClick={() => addFromBank(row)}
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
            Add custom
          </p>
          <div className="flex gap-2">
            <Input
              value={customLabel}
              onChange={(event) => setCustomLabel(event.target.value)}
              placeholder="Describe the objection"
              className="h-11"
            />
            <Button
              type="button"
              onClick={addCustom}
              disabled={!customLabel.trim()}
              className="h-11 px-3"
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
