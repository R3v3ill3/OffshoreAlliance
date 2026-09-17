// @vitest-environment jsdom
/**
 * The DOM half of the wall chart's drag edge auto-scroll.
 *
 * The hook renders nothing, so there is no markup to assert on: what it must
 * get right is the lifecycle. It attaches its document listeners on mount and
 * gives every one of them back on unmount; it runs an animation-frame loop
 * only while a native drag is actually in progress; it scrolls the nearest
 * scrollable ancestor of the drop target when there is one and the window
 * otherwise; and it leaves the drag events themselves untouched, because the
 * unit cards' own `dragover`/`drop` handling has to keep working exactly as it
 * did.
 *
 * `requestAnimationFrame` is replaced with a hand-driven queue so each frame is
 * a deliberate step rather than a race with the test runner, and the scrollable
 * panel gets a real `scrollTop` — jsdom has no layout, so it reports 0 for
 * every scroll geometry unless the test supplies one.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useDragAutoScroll } from "../use-drag-auto-scroll";

const VIEWPORT_HEIGHT = 800;

/** The drag events this hook listens for. */
const DRAG_EVENTS = ["dragstart", "dragover", "dragend", "drop"] as const;

type PendingFrame = { id: number; callback: FrameRequestCallback };

let pendingFrames: PendingFrame[] = [];
let nextFrameId = 1;
let requestFrame: MockInstance;
let cancelFrame: MockInstance;
let scrollBySpy: MockInstance;
let addListenerSpy: MockInstance;
let removeListenerSpy: MockInstance;
let container: HTMLElement | null = null;
let root: Root | null = null;
let tileEl: HTMLElement | null = null;

function Probe() {
  useDragAutoScroll();
  return null;
}

function mountProbe(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  const host = container;
  act(() => {
    root = createRoot(host);
    root.render(<Probe />);
  });
}

function unmountProbe(): void {
  if (!root) return;
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

/** Run the single frame the loop currently has scheduled, if any. */
function runFrame(): void {
  const frame = pendingFrames.shift();
  if (!frame) return;
  act(() => {
    frame.callback(0);
  });
}

/** A stand-in for a worker tile: the node a drag event is dispatched from. */
function tile(): HTMLElement {
  if (!tileEl) {
    tileEl = document.createElement("div");
    document.body.appendChild(tileEl);
  }
  return tileEl;
}

/**
 * jsdom implements neither `DragEvent` nor a layout-backed `scrollTop`, so the
 * drags are `MouseEvent`s — the only thing the hook reads off them is
 * `clientY`, which `MouseEvent` carries.
 */
function fireDrag(type: string, clientY: number, source?: Element): Event {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  (source ?? tile()).dispatchEvent(event);
  return event;
}

/** A panel that reports real scroll geometry, with a working `scrollTop`. */
function scrollablePanel(initialScrollTop = 0): { panel: HTMLElement; inner: HTMLElement } {
  const panel = document.createElement("div");
  panel.style.overflowY = "auto";
  let scrollTop = initialScrollTop;
  Object.defineProperty(panel, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(panel, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(panel, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = next;
    },
  });
  const inner = document.createElement("div");
  panel.appendChild(inner);
  document.body.appendChild(panel);
  return { panel, inner };
}

/** Which of the drag events `spy` saw. */
function dragEventsSeen(spy: MockInstance): string[] {
  return spy.mock.calls
    .map((call) => String(call[0]))
    .filter((type) => (DRAG_EVENTS as readonly string[]).includes(type))
    .sort();
}

const ALL_DRAG_EVENTS = [...DRAG_EVENTS].sort();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  pendingFrames = [];
  nextFrameId = 1;

  requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId++;
    pendingFrames.push({ id, callback });
    return id;
  });
  cancelFrame = vi.fn((id: number) => {
    pendingFrames = pendingFrames.filter((frame) => frame.id !== id);
  });
  scrollBySpy = vi.fn();

  // jsdom's globalThis *is* the window, so stubbing here is what the hook sees.
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  vi.stubGlobal("scrollBy", scrollBySpy);
  vi.stubGlobal("innerHeight", VIEWPORT_HEIGHT);

  addListenerSpy = vi.spyOn(document, "addEventListener");
  removeListenerSpy = vi.spyOn(document, "removeEventListener");
});

afterEach(() => {
  unmountProbe();
  tileEl?.remove();
  tileEl = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useDragAutoScroll — listener lifecycle", () => {
  it("attaches one document listener per drag event on mount", () => {
    mountProbe();
    expect(dragEventsSeen(addListenerSpy)).toEqual(ALL_DRAG_EVENTS);
  });

  it("removes every listener it attached on unmount", () => {
    mountProbe();
    expect(dragEventsSeen(removeListenerSpy)).toEqual([]);
    unmountProbe();
    expect(dragEventsSeen(removeListenerSpy)).toEqual(ALL_DRAG_EVENTS);
  });

  it("is completely inert after unmount", () => {
    mountProbe();
    unmountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });
});

describe("useDragAutoScroll — only while a drag is in progress", () => {
  it("schedules nothing when no drag has started", () => {
    mountProbe();
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  it("starts a frame loop on dragstart and keeps it alive across frames", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    runFrame();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(pendingFrames).toHaveLength(1);
  });

  it("cancels the pending frame and stops scrolling on dragend", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    runFrame();
    scrollBySpy.mockClear();

    fireDrag("dragend", VIEWPORT_HEIGHT - 4);
    expect(cancelFrame).toHaveBeenCalled();
    expect(pendingFrames).toHaveLength(0);

    runFrame();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  it("cancels the pending frame on drop", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    fireDrag("drop", VIEWPORT_HEIGHT - 4);
    expect(pendingFrames).toHaveLength(0);
  });
});

describe("useDragAutoScroll — scrolling", () => {
  it("scrolls the window down when the pointer nears the bottom edge", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    runFrame();

    expect(scrollBySpy).toHaveBeenCalledTimes(1);
    const [x, y] = scrollBySpy.mock.calls[0] as [number, number];
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0);
  });

  it("scrolls the window up when the pointer nears the top edge", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", 4);
    runFrame();

    const [, y] = scrollBySpy.mock.calls[0] as [number, number];
    expect(y).toBeLessThan(0);
  });

  it("does not scroll while the pointer is in the dead zone", () => {
    mountProbe();
    fireDrag("dragstart", 400);
    fireDrag("dragover", VIEWPORT_HEIGHT / 2);
    runFrame();
    runFrame();

    expect(scrollBySpy).not.toHaveBeenCalled();
    // The loop stays alive: the pointer can move back into a band later.
    expect(pendingFrames).toHaveLength(1);
  });

  it("scrolls faster the deeper into the band the pointer sits", () => {
    mountProbe();
    fireDrag("dragstart", 400);

    fireDrag("dragover", VIEWPORT_HEIGHT - 60);
    runFrame();
    fireDrag("dragover", VIEWPORT_HEIGHT - 2);
    runFrame();

    const [, shallow] = scrollBySpy.mock.calls[0] as [number, number];
    const [, deep] = scrollBySpy.mock.calls[1] as [number, number];
    expect(deep).toBeGreaterThan(shallow);
  });

  it("scrolls the nearest scrollable ancestor of the drop target, not the window", () => {
    mountProbe();
    const { panel, inner } = scrollablePanel();

    fireDrag("dragstart", 400, inner);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4, inner);
    runFrame();

    expect(panel.scrollTop).toBeGreaterThan(0);
    expect(scrollBySpy).not.toHaveBeenCalled();
    panel.remove();
  });

  it("falls back to the window once an inner scroller is at its limit", () => {
    mountProbe();
    const { panel, inner } = scrollablePanel(1600);

    fireDrag("dragstart", 400, inner);
    fireDrag("dragover", VIEWPORT_HEIGHT - 4, inner);
    runFrame();

    expect(scrollBySpy).toHaveBeenCalledTimes(1);
    expect(panel.scrollTop).toBe(1600);
    panel.remove();
  });
});

describe("useDragAutoScroll — leaves the drag protocol alone", () => {
  it("never preventDefaults an event it does not own", () => {
    mountProbe();
    const started = fireDrag("dragstart", 400);
    const over = fireDrag("dragover", VIEWPORT_HEIGHT - 4);
    const dropped = fireDrag("drop", VIEWPORT_HEIGHT - 4);

    expect(started.defaultPrevented).toBe(false);
    expect(over.defaultPrevented).toBe(false);
    expect(dropped.defaultPrevented).toBe(false);
  });
});
