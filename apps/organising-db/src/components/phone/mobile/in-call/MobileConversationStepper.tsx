"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, CircleSlash } from "lucide-react";
import type { CallScriptSection } from "@/types/planner-types";
import { MobileNotesField } from "@/components/phone/mobile/primitives/MobileNotesField";

interface MobileConversationStepperProps {
  sections: CallScriptSection[];
  currentIndex: number;
  reachedSections: Set<number>;
  stepNotes: Record<number, string>;
  onAdvance: () => void;
  onGoTo: (index: number) => void;
  onSetReached: (index: number, reached: boolean) => void;
  onNoteChange: (index: number, notes: string) => void;
  /** Variables to interpolate into section content (e.g. {{first_name}}). */
  workerContext: Record<string, string | undefined>;
}

/**
 * Mobile conversation stepper. One section at a time. Swipe-friendly:
 * touchstart/touchend on the card detects a horizontal swipe and advances /
 * goes back. Per-section notes and reach/skip controls inline.
 */
export function MobileConversationStepper({
  sections,
  currentIndex,
  reachedSections,
  stepNotes,
  onAdvance,
  onGoTo,
  onSetReached,
  onNoteChange,
  workerContext,
}: MobileConversationStepperProps) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  if (sections.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
        No structured script attached to this list.
      </p>
    );
  }

  const section = sections[Math.min(currentIndex, sections.length - 1)];
  const total = sections.length;
  const reached = reachedSections.has(currentIndex);

  function interpolate(text: string | null | undefined): string {
    if (!text) return "";
    return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = workerContext[key];
      return value != null ? value : `{{${key}}}`;
    });
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX == null) return;
    const dx = event.changedTouches[0]?.clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      if (dx < 0 && currentIndex < total - 1) onAdvance();
      else if (dx > 0 && currentIndex > 0) onGoTo(currentIndex - 1);
    }
    setTouchStartX(null);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Step {currentIndex + 1} of {total}
        </span>
        <div className="flex items-center gap-1">
          {sections.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onGoTo(i)}
              aria-label={`Go to step ${i + 1}`}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i === currentIndex
                  ? "bg-primary"
                  : reachedSections.has(i)
                    ? "bg-primary/40"
                    : "bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      </div>

      <div
        onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
        onTouchEnd={handleTouchEnd}
        className="rounded-2xl border bg-card p-4 shadow-sm"
      >
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {section.section_type ?? "Section"}
          </p>
          <h3 className="text-base font-semibold leading-tight">{section.title}</h3>
        </div>
        {section.body_text ? (
          <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {interpolate(section.body_text)}
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSetReached(currentIndex, !reached)}
            className={`inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
              reached
                ? "bg-emerald-100 text-emerald-800"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
            aria-pressed={reached}
          >
            {reached ? <Check className="h-3.5 w-3.5" /> : <CircleSlash className="h-3.5 w-3.5" />}
            {reached ? "Reached" : "Mark reached"}
          </button>
        </div>
        <div className="mt-3">
          <MobileNotesField
            value={stepNotes[currentIndex] ?? ""}
            onChange={(text) => onNoteChange(currentIndex, text)}
            placeholder="Notes for this section (optional)…"
            minRows={2}
            disableVoice
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => onGoTo(Math.max(0, currentIndex - 1))}
          className="inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={currentIndex >= total - 1}
          onClick={onAdvance}
          className="inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
