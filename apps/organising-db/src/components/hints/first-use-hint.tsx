"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
 * Scrolling: a hint whose target is off-screen is useless — the callout is
 * positioned next to its anchor, so if the anchor is below the fold the copy
 * and "Got it" are below the fold with it (Radix collision handling only
 * shifts the content within the viewport along its own axis; it cannot bring
 * an off-screen anchor on-screen). So when `visible` becomes true the anchor
 * is brought into view once per mount, and nothing scrolls while the hint
 * is hidden (fix round 2).
 *
 * "Once" is one scroll plus at most two corrections, not a single call: the
 * wall chart's campaign summary is sticky and collapses when its sentinel
 * leaves the viewport (`campaign-wall-chart.tsx`, `isSummaryStuck`), with
 * scroll anchoring disabled, so a scroll that carries the sentinel across
 * the viewport edge is followed by a layout shift of everything below it —
 * a tile centred by a single `scrollIntoView` can end up behind the stuck
 * bar, or below the fold, once the summary has re-laid out. The effect
 * therefore scrolls (smooth unless the organiser prefers reduced motion),
 * waits for the anchor's rect to stop moving, and re-centres instantly if
 * the anchor is not fully within the viewport and uncovered
 * (`elementFromPoint`). Bounded, cancelled if the hint hides or unmounts.
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
const MAX_SCROLL_ATTEMPTS = 3;
/** Consecutive frames with an unchanged anchor top before the scroll is treated as settled. */
const SETTLED_FRAMES = 6;
/** Upper bound on the settle wait per attempt (~2 s at 60 fps). */
const MAX_SETTLE_FRAMES = 120;

/**
 * True when `anchor` is fully inside the viewport and the element under its
 * centre is the anchor itself (or the hint callout, which may legitimately
 * overlap it on a narrow screen) — i.e. it is not hidden behind the sticky
 * summary or the page header. Without `elementFromPoint` (test DOMs) the
 * rect check alone decides.
 */
function isAnchorClear(anchor: HTMLElement, content: HTMLElement | null): boolean {
  const rect = anchor.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true; // nothing to bring into view
  const inViewport =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;
  if (!inViewport) return false;
  if (typeof document.elementFromPoint !== "function") return true;
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return hit !== null && (anchor.contains(hit) || (content?.contains(hit) ?? false));
}

export function FirstUseHint({ id, visible, onDismiss, children }: FirstUseHintProps) {
  const hint = HINT_BY_ID[id];
  const anchorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Set when the callout itself (button or Escape) closed the hint, so the
  // close-focus handler knows to hand focus back to the anchor. Not set when
  // the parent hid the hint because the organiser opened the rating control:
  // focus is already where it should be.
  const returnFocusRef = useRef(false);
  // Set once the anchor has been brought into view for this mount, so a
  // re-render (or a re-show after a failed write, see use-first-use-hint.ts)
  // never scrolls the chart a second time.
  const scrolledRef = useRef(false);

  useEffect(() => {
    if (!visible || scrolledRef.current) return;
    const el = anchorRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    scrolledRef.current = true;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const attempt = () => {
      if (cancelled || attempts >= MAX_SCROLL_ATTEMPTS) return;
      if (isAnchorClear(el, contentRef.current)) return;
      attempts += 1;
      el.scrollIntoView({
        block: "center",
        behavior: attempts === 1 && !reduceMotion ? "smooth" : "auto",
      });
      // Wait for the anchor to stop moving (smooth scroll, then any sticky
      // re-layout it triggered) before deciding whether a correction is due.
      let lastTop = Number.NaN;
      let stableFrames = 0;
      let frames = 0;
      const tick = () => {
        if (cancelled) return;
        const top = el.getBoundingClientRect().top;
        stableFrames = top === lastTop ? stableFrames + 1 : 0;
        lastTop = top;
        frames += 1;
        if (stableFrames >= SETTLED_FRAMES || frames >= MAX_SETTLE_FRAMES) {
          attempt();
          return;
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };

    attempt();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [visible]);

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
