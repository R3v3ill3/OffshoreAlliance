"use client";

import type { CtaAmbitionWithAssessment, CtaRatingValue } from "@/components/phone/CtaRatingsPanel";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import { RATING_LEVELS } from "@/types/planner-types";

interface MobileCtaPanelProps {
  ambitions: CtaAmbitionWithAssessment[];
  values: Map<number, CtaRatingValue>;
  onChange: (id: number, next: CtaRatingValue | null) => void;
}

/**
 * Mobile-first CTA ratings — one card per ambition with thumb-sized chip
 * rows. Binary CTAs render as 4-button selector (yes/no/unsure/abstain),
 * scalar CTAs render as 1..5.
 */
export function MobileCtaPanel({ ambitions, values, onChange }: MobileCtaPanelProps) {
  if (ambitions.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        CTA ratings
      </p>
      <div className="space-y-2">
        {ambitions.map((ambition) => {
          const activity = ambition.activity;
          const isBinary = activity?.is_binary ?? false;
          const value = values.get(ambition.id) ?? null;

          return (
            <div key={ambition.id} className="rounded-2xl border bg-card p-3 shadow-sm">
              <p className="text-sm font-semibold leading-tight">{ambition.cta_label}</p>
              {activity?.title ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Assessment: {activity.title}
                  {isBinary ? " · binary" : ""}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-amber-700">
                  No linked assessment — rating recorded but won&apos;t feed wall chart.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {isBinary
                  ? VOTE_SUPPORTER_OPTIONS.map((option) => {
                      const selected = value?.binary_value === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            const cleared =
                              selected && value?.rating == null && !value?.notes ? null : ({
                                rating: value?.rating ?? null,
                                binary_value: selected ? null : option.value,
                                notes: value?.notes ?? null,
                              } satisfies CtaRatingValue);
                            onChange(ambition.id, cleared);
                          }}
                          aria-pressed={selected}
                          className={`inline-flex h-11 items-center justify-center rounded-full border px-4 text-sm font-medium ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow"
                              : "border-muted-foreground/20 bg-background hover:bg-muted"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })
                  : RATING_LEVELS.filter((level) => level.value > 0).map((level) => {
                      const selected = value?.rating === level.value;
                      return (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => {
                            const cleared =
                              selected && value?.binary_value == null && !value?.notes
                                ? null
                                : ({
                                    rating: selected ? null : level.value,
                                    binary_value: value?.binary_value ?? null,
                                    notes: value?.notes ?? null,
                                  } satisfies CtaRatingValue);
                            onChange(ambition.id, cleared);
                          }}
                          aria-pressed={selected}
                          className={`inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border px-3 text-sm font-semibold tabular-nums ${
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow"
                              : "border-muted-foreground/20 bg-background hover:bg-muted"
                          }`}
                          title={level.shortLabel}
                        >
                          {level.value}
                        </button>
                      );
                    })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
