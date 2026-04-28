"use client";

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
import {
  EMPLOYER_INTERACTION_STATES,
  type EmployerInteractionState,
} from "@/lib/situation-analysis/constants";

interface EmployerInteractionFieldProps {
  value: EmployerInteractionState | null;
  notes: string;
  ballotedCount: number | null;
  onChange: (next: {
    value: EmployerInteractionState | null;
    notes: string;
    ballotedCount: number | null;
  }) => void;
}

export function EmployerInteractionField({
  value,
  notes,
  ballotedCount,
  onChange,
}: EmployerInteractionFieldProps) {
  const definition = EMPLOYER_INTERACTION_STATES.find((s) => s.id === value);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>State of employer interaction *</Label>
        <Select
          value={value ?? ""}
          onValueChange={(v) =>
            onChange({
              value: (v || null) as EmployerInteractionState | null,
              notes,
              ballotedCount: v === "agreement_balloted" ? ballotedCount : null,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick the state that best describes where things are…" />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYER_INTERACTION_STATES.map((state) => (
              <SelectItem key={state.id} value={state.id}>
                {state.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {definition && (
          <p className="text-xs text-muted-foreground">
            {definition.description}
          </p>
        )}
      </div>

      {value === "agreement_balloted" && (
        <div className="space-y-2">
          <Label>How many times has the agreement been balloted?</Label>
          <Input
            type="number"
            min={1}
            value={ballotedCount ?? ""}
            onChange={(e) =>
              onChange({
                value,
                notes,
                ballotedCount: e.target.value
                  ? Math.max(1, Number(e.target.value))
                  : null,
              })
            }
            className="w-32"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>What&apos;s actually happening? (optional)</Label>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) =>
            onChange({ value, notes: e.target.value, ballotedCount })
          }
          placeholder="Anything specific to this campaign — recent moves, signals, key dates."
        />
      </div>
    </div>
  );
}
