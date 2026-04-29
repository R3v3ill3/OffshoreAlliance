"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  ISSUE_HEAT_LEVELS,
  type IssueHeat,
} from "@/lib/situation-analysis/constants";
import type { TopIssue } from "@/lib/situation-analysis/types";

interface TopIssuesFieldProps {
  issues: TopIssue[];
  onChange: (next: TopIssue[]) => void;
}

const MAX_ISSUES = 5;

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export function TopIssuesField({ issues, onChange }: TopIssuesFieldProps) {
  const updateAt = (index: number, patch: Partial<TopIssue>) => {
    onChange(
      issues.map((issue, i) => (i === index ? { ...issue, ...patch } : issue))
    );
  };

  const removeAt = (index: number) => {
    onChange(issues.filter((_, i) => i !== index));
  };

  const addIssue = () => {
    if (issues.length >= MAX_ISSUES) return;
    onChange([
      ...issues,
      { draft_id: newDraftId(), label: "", heat: 3, notes: "" },
    ]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        What are the issues with the most heat behind them right now? Surface
        three to five — these become agitation hooks in downstream comms drafts
        and phone scripts.
      </p>

      {issues.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No issues yet. Add your first below.
        </p>
      )}

      {issues.map((issue, index) => (
        <div
          key={issue.draft_id ?? index}
          className="rounded-md border bg-muted/20 p-3 space-y-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Label>Issue {index + 1} *</Label>
              <Input
                value={issue.label}
                onChange={(e) => updateAt(index, { label: e.target.value })}
                placeholder="e.g. Rates erosion, allowance changes, demob terms"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeAt(index)}
              className="mt-7"
              aria-label="Remove issue"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Heat</span>
              <span className="text-xs text-muted-foreground font-normal">
                {ISSUE_HEAT_LEVELS.find((h) => h.value === issue.heat)?.label} (
                {issue.heat}/5)
              </span>
            </Label>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={issue.heat}
              onChange={(e) =>
                updateAt(index, { heat: Number(e.target.value) as IssueHeat })
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={issue.notes ?? ""}
              onChange={(e) => updateAt(index, { notes: e.target.value })}
              placeholder="Specific stories, recent flashpoints, or who feels this most."
            />
          </div>
        </div>
      ))}

      {issues.length < MAX_ISSUES && (
        <Button variant="outline" size="sm" onClick={addIssue}>
          <Plus className="h-4 w-4 mr-2" />
          Add issue
        </Button>
      )}
    </div>
  );
}
