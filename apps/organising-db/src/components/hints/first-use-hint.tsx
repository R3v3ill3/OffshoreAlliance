"use client";

import type { ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { HINT_BY_ID, type HintId } from "@/lib/hints/registry";

export interface FirstUseHintProps {
  id: HintId;
  /** "Got it" was pressed. The parent owns the visibility decision. */
  onDismiss?: () => void;
  /** The control the hint points at, rendered unmodified. */
  children: ReactNode;
}

/**
 * WP1.7 — a one-sentence, non-modal, dismissible callout anchored to a control.
 *
 * Radix Popover is non-modal by default (no focus trap, no scroll lock, no
 * outside-click capture), so the screen underneath stays fully usable. The
 * content is kept in the tab order and "Got it" is a real button, so the hint
 * is keyboard-reachable and dismissible with Enter/Space. `onOpenAutoFocus`
 * is prevented so opening the screen never yanks focus off it. Placement is
 * left to Radix collision handling (`side` + `collisionPadding`) so the
 * callout flips/shifts into the viewport on a small screen instead of
 * covering the control it points at.
 *
 * `PopoverAnchor` is used WITHOUT `asChild` on purpose: the child may itself
 * be another Popover's trigger (the rating badge is), and merging props onto
 * it would make the two roots share a DOM node and a ref. The Anchor renders
 * its own wrapper element instead.
 *
 * The parent decides visibility (useFirstUseHint + shouldShowHint); this
 * component only refuses to render a pending or unknown entry.
 */
export function FirstUseHint({ id, onDismiss, children }: FirstUseHintProps) {
  const hint = HINT_BY_ID[id];
  if (!hint || hint.pending) return <>{children}</>;
  return (
    <Popover open>
      <PopoverAnchor>{children}</PopoverAnchor>
      <PopoverContent
        side="right"
        align="center"
        sideOffset={8}
        collisionPadding={8}
        role="status"
        aria-live="polite"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={onDismiss}
        className="w-64 p-3 text-sm"
      >
        <p>{hint.copy}</p>
        {/* h-11 / min-w-11 = 44 px, at least 1 cm on touch (plan 4 principle 17); the default size="sm" is h-8. */}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-11 min-w-11"
          onClick={onDismiss}
        >
          Got it
        </Button>
      </PopoverContent>
    </Popover>
  );
}
