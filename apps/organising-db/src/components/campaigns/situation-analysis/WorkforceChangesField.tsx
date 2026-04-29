"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import {
  WORKFORCE_EVENT_SCALES,
  WORKFORCE_EVENT_TYPES,
  type WorkforceEventScale,
  type WorkforceEventType,
} from "@/lib/situation-analysis/constants";
import type { WorkforceChange } from "@/lib/situation-analysis/types";

interface WorkforceChangesFieldProps {
  changes: WorkforceChange[];
  onChange: (next: WorkforceChange[]) => void;
}

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

export function WorkforceChangesField({
  changes,
  onChange,
}: WorkforceChangesFieldProps) {
  const updateAt = (index: number, patch: Partial<WorkforceChange>) => {
    onChange(
      changes.map((c, i) => (i === index ? { ...c, ...patch } : c))
    );
  };

  const removeAt = (index: number) => {
    onChange(changes.filter((_, i) => i !== index));
  };

  const addChange = () => {
    onChange([
      ...changes,
      {
        draft_id: newDraftId(),
        event_type: "scheduled_shutdown",
        label: "",
        expected_date: null,
        scale: null,
        notes: "",
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Upcoming events that will change the workforce shape — shutdowns,
        redundancy rounds, scope openings/closings, contractor changes. These
        change the strategic timing window and feed leverage analysis.
      </p>

      {changes.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          None recorded yet.
        </p>
      )}

      {changes.map((change, index) => (
        <div
          key={change.draft_id ?? index}
          className="rounded-md border bg-muted/20 p-3 space-y-3"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={change.event_type}
                onValueChange={(v) =>
                  updateAt(index, { event_type: v as WorkforceEventType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFORCE_EVENT_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected date (approx)</Label>
              <Input
                type="date"
                value={change.expected_date ?? ""}
                onChange={(e) =>
                  updateAt(index, {
                    expected_date: e.target.value || null,
                  })
                }
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-2">
              <Label>Label</Label>
              <Input
                value={change.label}
                onChange={(e) => updateAt(index, { label: e.target.value })}
                placeholder="e.g. 6-week shutdown bringing on ~300 workers"
              />
            </div>
            <div className="space-y-2">
              <Label>Scale</Label>
              <Select
                value={change.scale ?? ""}
                onValueChange={(v) =>
                  updateAt(index, {
                    scale: (v || null) as WorkforceEventScale | null,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {WORKFORCE_EVENT_SCALES.map((scale) => (
                    <SelectItem key={scale.id} value={scale.id}>
                      {scale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={change.notes ?? ""}
              onChange={(e) => updateAt(index, { notes: e.target.value })}
              placeholder="What's the strategic implication for this campaign?"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeAt(index)}
            className="text-muted-foreground"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addChange}>
        <Plus className="h-4 w-4 mr-2" />
        Add upcoming change
      </Button>
    </div>
  );
}
