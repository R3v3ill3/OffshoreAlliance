"use client";

import { useEffect } from "react";

import {
  DEFAULT_EDGE_THRESHOLD_PX,
  DEFAULT_MAX_SPEED_PX,
  scrollVelocityFor,
  type ScrollVelocityOptions,
} from "./drag-auto-scroll";

/**
 * Scroll the page while a native HTML5 drag is in progress and the pointer is
 * near a viewport edge.
 *
 * The wall chart drags worker tiles and whole unit cards with the browser's
 * own drag and drop (`draggable` + `dataTransfer`, see `dnd.ts`). Chromium
 * does not auto-scroll for those, so before this hook a card could only be
 * dropped onto a unit that was already on screen when the drag began — units
 * separated by other units were simply unreachable. This hook restores the
 * scrolling half of the gesture.
 *
 * Deliberate properties:
 *
 *   - It adds **no DOM**. It renders nothing and wraps nothing, so mounting it
 *     cannot move the wall chart's characterisation snapshots.
 *   - It never calls `preventDefault` or `stopPropagation`. The drop targets
 *     own the drag protocol exactly as they did before; this hook only reads
 *     the pointer position off events that are already flying past.
 *   - It is inert unless a drag started in this document: the animation frame
 *     loop exists only between `dragstart` and `dragend`/`drop`.
 *   - Listeners are registered in the capture phase so a handler that stops
 *     propagation cannot blind it, and every one of them — plus any pending
 *     frame — is released on unmount.
 *
 * `prefers-reduced-motion` is intentionally **not** honoured: here the
 * scrolling is the feature rather than decoration, and suppressing it would
 * reinstate the very defect this hook fixes for exactly the users who asked
 * for less movement. Movement is at most {@link DEFAULT_MAX_SPEED_PX} px per
 * frame and only ever while the user is actively holding a drag.
 */
export function useDragAutoScroll(options: ScrollVelocityOptions = {}): void {
  const { threshold = DEFAULT_EDGE_THRESHOLD_PX, maxSpeed = DEFAULT_MAX_SPEED_PX } = options;

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let dragging = false;
    let pointerY = 0;
    let target: Element | null = null;
    let frame: number | null = null;

    const step = () => {
      frame = null;
      if (!dragging) return;
      const velocity = scrollVelocityFor(pointerY, window.innerHeight, {
        threshold,
        maxSpeed,
      });
      if (velocity !== 0) {
        scrollBy(target, velocity);
      }
      // Keep the loop alive for the whole drag: the pointer can sit still in a
      // band, and a `dragover` only fires when it moves.
      frame = window.requestAnimationFrame(step);
    };

    const start = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(step);
    };

    const stop = () => {
      dragging = false;
      target = null;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    };

    const onDragStart = (event: DragEvent) => {
      dragging = true;
      pointerY = event.clientY;
      target = elementOf(event);
      start();
    };

    const onDragOver = (event: DragEvent) => {
      if (!dragging) return;
      pointerY = event.clientY;
      target = elementOf(event);
      start();
    };

    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragend", stop, true);
    document.addEventListener("drop", stop, true);

    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("dragend", stop, true);
      document.removeEventListener("drop", stop, true);
      stop();
    };
  }, [threshold, maxSpeed]);
}

function elementOf(event: Event): Element | null {
  const node = event.target;
  return node instanceof Element ? node : null;
}

/**
 * Move the nearest scrollable ancestor of the drop target, else the window.
 * A scroller already pinned at its limit in the requested direction is passed
 * over, so a drag that reaches the bottom of an inner panel goes on to scroll
 * the page instead of stalling there.
 */
function scrollBy(target: Element | null, delta: number): void {
  const scroller = findScrollableAncestor(target);
  if (scroller && !atScrollLimit(scroller, delta)) {
    scroller.scrollTop += delta;
    return;
  }
  if (typeof window.scrollBy === "function") window.scrollBy(0, delta);
}

function atScrollLimit(scroller: Element, delta: number): boolean {
  if (delta < 0) return scroller.scrollTop <= 0;
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
}

/**
 * The nearest ancestor of `start` (inclusive) that can actually scroll
 * vertically, or null when only the page itself can. `document.body` and
 * `<html>` are excluded on purpose: the page scrolls through the window, and
 * setting `scrollTop` on those is unreliable across engines.
 *
 * Exported for the hook's tests; not part of the module's public surface.
 */
export function findScrollableAncestor(start: Element | null): Element | null {
  let node: Element | null = start;
  while (node && node !== document.body && node !== document.documentElement) {
    if (isVerticallyScrollable(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function isVerticallyScrollable(element: Element): boolean {
  if (element.scrollHeight <= element.clientHeight) return false;
  let overflowY: string;
  try {
    overflowY = window.getComputedStyle(element).overflowY;
  } catch {
    return false;
  }
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}
