"use client";

import { useRef, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { HINT_BY_ID, type HintId } from "@/lib/hints/registry";

export interface FirstUseHintProps {
  id: HintId;
  /**
   * Whether the callout is shown. The anchor wrapper around `children` is
   * rendered either way, so toggling this never changes the child's position
   * in the React tree (fix round 1, finding 1).
   */
  visible: boolean;
  /** "Got it" was pressed (or Escape with focus inside). The parent owns the visibility decision. */
  onDismiss?: () => void;
  /** The control the hint points at, rendered unmodified. */
  children: ReactNode;
}

/**
 * WP1.7 — a one-sentence, non-modal, dismissible callout anchored to a control.
 *
 * Radix Popover is non-modal by default (no focus trap, no scroll lock, no
 * outside-click capture), so the screen underneath stays fully usable.
 * Placement is left to Radix collision handling (`side` + `collisionPadding`)
 * so the callout flips/shifts into the viewport on a small screen instead of
 * covering the control it points at.
 *
 * Keyboard: the content is PORTALLED to the end of <body>, so Tab from the
 * badge does NOT reach "Got it" — it is reached at the end of the document's
 * tab order, or announced via role="status"/aria-live. `onOpenAutoFocus` is
 * prevented so opening the screen never yanks focus off it. When "Got it"
 * (or Escape with focus inside the callout) closes it, focus returns to the
 * first focusable element inside the anchor — the badge — rather than being
 * dropped on <body>. Escape is only honoured when focus is inside the
 * callout; Radix's listener is document-wide and a stray Escape elsewhere
 * on the chart must not count as "seen".
 *
 * Tree shape: the wrapper (`Popover` + `PopoverAnchor`) is rendered whether
 * or not the hint is visible, and only `open` changes. The child is another
 * Popover's trigger; if the wrapper appeared and disappeared with the hint,
 * dismissing the hint would remount the child and lose the rating popover's
 * `open` state on the very click that opened it.
 *
 * Event isolation: the portalled content is still a React-tree descendant of
 * the tile's <button onClick>, so React events fired inside it bubble into
 * the tile. The content stops click/double-click/context-menu/drag
 * propagation, matching `inline-rating-popover.tsx`'s content.
 *
 * `PopoverAnchor` is used WITHOUT `asChild` on purpose: the child may itself
 * be another Popover's trigger (the rating badge is), and merging props onto
 * it would make the two roots share a DOM node and a ref. The Anchor renders
 * its own wrapper element instead, tagged `data-hint-anchor={id}` for the
 * e2e spec.
 *
 * The parent decides visibility (useFirstUseHint + shouldShowHint); this
 * component only refuses to render a pending or unknown entry.
 */
export function FirstUseHint({ id, visible, onDismiss, children }: FirstUseHintProps) {
  const hint = HINT_BY_ID[id];
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Set when the callout itself (button or Escape) closed the hint, so the
  // close-focus handler knows to hand focus back to the anchor. Not set when
  // the parent hid the hint because the organiser opened the rating control:
  // focus is already where it should be.
  const returnFocusRef = useRef(false);

  if (!hint || hint.pending) return <>{children}</>;

  const dismissFromCallout = () => {
    returnFocusRef.current = true;
    onDismiss?.();
  };

  return (
    <Popover open={visible}>
      <PopoverAnchor ref={anchorRef} data-hint-anchor={id}>
        {children}
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        side="right"
        align="center"
        sideOffset={8}
        collisionPadding={8}
        role="status"
        aria-live="polite"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (!returnFocusRef.current) return;
          returnFocusRef.current = false;
          anchorRef.current
            ?.querySelector<HTMLElement>('[tabindex="0"], button, [role="button"]')
            ?.focus();
        }}
        onEscapeKeyDown={() => {
          const active = typeof document === "undefined" ? null : document.activeElement;
          if (active && contentRef.current?.contains(active)) dismissFromCallout();
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
        onDragStart={(e) => e.stopPropagation()}
        className="w-64 p-3 text-sm"
      >
        <p>{hint.copy}</p>
        {/* h-11 / min-w-11 = 44 px, at least 1 cm on touch (plan 4 principle 17); the default size="sm" is h-8. */}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-11 min-w-11"
          onClick={dismissFromCallout}
        >
          Got it
        </Button>
      </PopoverContent>
    </Popover>
  );
}
