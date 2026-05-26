"use client";

import { OUTCOME_OPTIONS, type OutcomeClassification } from "@/lib/phone/outcome-model";
import { outcomeSentimentClass } from "@/lib/ui/dialer-tokens";

interface MobileOutcomeWheelProps {
  value: OutcomeClassification | null;
  onChange: (value: OutcomeClassification | null) => void;
  /**
   * Hide outcomes that don't apply to the active dial disposition.
   * Defaults to showing all 14.
   */
  filter?: (option: OutcomeClassification) => boolean;
}

/**
 * Outcome wheel — a grid of large chips for picking exactly one
 * `outcome_classification`. Tap toggles selection; selected chip uses
 * the sentiment colour.
 */
export function MobileOutcomeWheel({ value, onChange, filter }: MobileOutcomeWheelProps) {
  const options = filter ? OUTCOME_OPTIONS.filter((o) => filter(o.value)) : OUTCOME_OPTIONS;

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Call outcome
      </legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Call outcome">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : option.value)}
              className={`inline-flex min-h-[58px] flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                selected
                  ? `${outcomeSentimentClass(option.value)} border-current shadow-sm`
                  : "border-muted-foreground/20 bg-card hover:bg-muted/40"
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{option.label}</span>
              <span className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                {option.shortHelp}
              </span>
            </button>
          );
        })}
      </div>
      {value ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Selected: <strong>{OUTCOME_OPTIONS.find((o) => o.value === value)?.label}</strong>
        </p>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
          Pick one to enable “Save & next”.
        </p>
      )}
    </fieldset>
  );
}
