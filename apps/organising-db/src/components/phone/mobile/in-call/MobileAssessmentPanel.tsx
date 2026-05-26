"use client";

import type { SessionAssessmentRow } from "@/lib/phone/session/types";

export interface AssessmentValue {
  rating: number | null;
  notes: string | null;
}

interface MobileAssessmentPanelProps {
  assessments: SessionAssessmentRow[];
  values: Map<number, AssessmentValue>;
  onChange: (activityId: number, next: AssessmentValue | null) => void;
}

/**
 * Mobile-first assessment ratings — one row per assessment the driver
 * selected when the call action was created. 1..5 chips + explicit
 * "Unassessed" pill so a caller can deliberately skip an assessment.
 */
export function MobileAssessmentPanel({ assessments, values, onChange }: MobileAssessmentPanelProps) {
  if (assessments.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Session assessments
      </p>
      <div className="space-y-2">
        {assessments.map((assessment) => {
          const value = values.get(assessment.activity_id) ?? { rating: null, notes: null };
          return (
            <div key={assessment.activity_id} className="rounded-2xl border bg-card p-3 shadow-sm">
              <p className="text-sm font-semibold leading-tight">{assessment.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange(assessment.activity_id, { rating: null, notes: value.notes })}
                  aria-pressed={value.rating == null}
                  className={`inline-flex h-10 items-center rounded-full border px-3 text-xs font-medium ${
                    value.rating == null
                      ? "border-primary bg-primary text-primary-foreground shadow"
                      : "border-muted-foreground/20 bg-background hover:bg-muted"
                  }`}
                >
                  Unassessed
                </button>
                {[1, 2, 3, 4, 5].map((rating) => {
                  const selected = value.rating === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      onClick={() =>
                        onChange(assessment.activity_id, {
                          rating: selected ? null : rating,
                          notes: value.notes,
                        })
                      }
                      aria-pressed={selected}
                      className={`inline-flex h-10 w-11 items-center justify-center rounded-full border text-sm font-semibold tabular-nums ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground shadow"
                          : "border-muted-foreground/20 bg-background hover:bg-muted"
                      }`}
                    >
                      {rating}
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
