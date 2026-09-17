/**
 * The pure half of the wall chart's drag edge auto-scroll.
 *
 * Every expectation here is geometry: where the bands are, what the dead zone
 * does, that the speed only ever grows towards an edge, and that the cap holds
 * however the caller abuses the inputs.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_THRESHOLD_PX,
  DEFAULT_MAX_SPEED_PX,
  scrollVelocityFor,
} from "../drag-auto-scroll";

const VIEWPORT = 800;

describe("scrollVelocityFor — dead zone", () => {
  it("is zero at the exact centre", () => {
    expect(scrollVelocityFor(VIEWPORT / 2, VIEWPORT)).toBe(0);
  });

  it("is zero everywhere between the two bands", () => {
    for (let y = DEFAULT_EDGE_THRESHOLD_PX; y <= VIEWPORT - DEFAULT_EDGE_THRESHOLD_PX; y += 8) {
      expect(scrollVelocityFor(y, VIEWPORT)).toBe(0);
    }
  });

  it("is zero on both band boundaries, so entering a band is continuous", () => {
    expect(scrollVelocityFor(DEFAULT_EDGE_THRESHOLD_PX, VIEWPORT)).toBe(0);
    expect(scrollVelocityFor(VIEWPORT - DEFAULT_EDGE_THRESHOLD_PX, VIEWPORT)).toBe(0);
  });
});

describe("scrollVelocityFor — top band", () => {
  it("scrolls up (negative) just inside the band", () => {
    expect(scrollVelocityFor(DEFAULT_EDGE_THRESHOLD_PX - 1, VIEWPORT)).toBeLessThan(0);
  });

  it("reaches exactly -maxSpeed at the top edge", () => {
    expect(scrollVelocityFor(0, VIEWPORT)).toBe(-DEFAULT_MAX_SPEED_PX);
  });

  it("gets faster the closer the pointer is to the edge", () => {
    let previous = 0;
    for (let y = DEFAULT_EDGE_THRESHOLD_PX - 1; y >= 0; y -= 1) {
      const velocity = scrollVelocityFor(y, VIEWPORT);
      expect(velocity).toBeLessThan(0);
      expect(velocity).toBeLessThan(previous);
      previous = velocity;
    }
  });
});

describe("scrollVelocityFor — bottom band", () => {
  it("scrolls down (positive) just inside the band", () => {
    expect(scrollVelocityFor(VIEWPORT - DEFAULT_EDGE_THRESHOLD_PX + 1, VIEWPORT)).toBeGreaterThan(0);
  });

  it("reaches exactly +maxSpeed at the bottom edge", () => {
    expect(scrollVelocityFor(VIEWPORT, VIEWPORT)).toBe(DEFAULT_MAX_SPEED_PX);
  });

  it("gets faster the closer the pointer is to the edge", () => {
    let previous = 0;
    for (let y = VIEWPORT - DEFAULT_EDGE_THRESHOLD_PX + 1; y <= VIEWPORT; y += 1) {
      const velocity = scrollVelocityFor(y, VIEWPORT);
      expect(velocity).toBeGreaterThan(0);
      expect(velocity).toBeGreaterThan(previous);
      previous = velocity;
    }
  });

  it("mirrors the top band", () => {
    for (let depth = 0; depth <= DEFAULT_EDGE_THRESHOLD_PX; depth += 4) {
      const top = scrollVelocityFor(DEFAULT_EDGE_THRESHOLD_PX - depth, VIEWPORT);
      const bottom = scrollVelocityFor(VIEWPORT - DEFAULT_EDGE_THRESHOLD_PX + depth, VIEWPORT);
      expect(bottom).toBeCloseTo(-top, 10);
    }
  });
});

describe("scrollVelocityFor — the cap", () => {
  it("never exceeds maxSpeed anywhere in or beyond the viewport", () => {
    for (let y = -500; y <= VIEWPORT + 500; y += 3) {
      expect(Math.abs(scrollVelocityFor(y, VIEWPORT))).toBeLessThanOrEqual(DEFAULT_MAX_SPEED_PX);
    }
  });

  it("honours a caller-supplied cap", () => {
    expect(scrollVelocityFor(0, VIEWPORT, { maxSpeed: 4 })).toBe(-4);
    expect(scrollVelocityFor(VIEWPORT, VIEWPORT, { maxSpeed: 4 })).toBe(4);
  });

  it("honours a caller-supplied threshold", () => {
    // 90px from the top is inside the default band but outside a 40px one.
    expect(scrollVelocityFor(90, VIEWPORT)).toBeLessThan(0);
    expect(scrollVelocityFor(90, VIEWPORT, { threshold: 40 })).toBe(0);
    expect(scrollVelocityFor(20, VIEWPORT, { threshold: 40 })).toBeLessThan(0);
  });
});

describe("scrollVelocityFor — out-of-range and degenerate inputs", () => {
  it("clamps a pointer dragged above the viewport to full speed up", () => {
    expect(scrollVelocityFor(-1, VIEWPORT)).toBe(-DEFAULT_MAX_SPEED_PX);
    expect(scrollVelocityFor(-9999, VIEWPORT)).toBe(-DEFAULT_MAX_SPEED_PX);
  });

  it("clamps a pointer dragged below the viewport to full speed down", () => {
    expect(scrollVelocityFor(VIEWPORT + 1, VIEWPORT)).toBe(DEFAULT_MAX_SPEED_PX);
    expect(scrollVelocityFor(VIEWPORT + 9999, VIEWPORT)).toBe(DEFAULT_MAX_SPEED_PX);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(scrollVelocityFor(Number.NaN, VIEWPORT)).toBe(0);
    expect(scrollVelocityFor(Number.POSITIVE_INFINITY, VIEWPORT)).toBe(0);
    expect(scrollVelocityFor(100, Number.NaN)).toBe(0);
    expect(scrollVelocityFor(100, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("returns 0 for an empty viewport", () => {
    expect(scrollVelocityFor(0, 0)).toBe(0);
    expect(scrollVelocityFor(10, -100)).toBe(0);
  });

  it("returns 0 when the caller disables the bands or the speed", () => {
    expect(scrollVelocityFor(0, VIEWPORT, { threshold: 0 })).toBe(0);
    expect(scrollVelocityFor(0, VIEWPORT, { maxSpeed: 0 })).toBe(0);
    expect(scrollVelocityFor(0, VIEWPORT, { threshold: -10 })).toBe(0);
  });

  it("shrinks the bands so they meet rather than overlap on a short viewport", () => {
    // 100px tall, 96px bands would overlap; each becomes 50px.
    expect(scrollVelocityFor(50, 100)).toBe(0);
    expect(scrollVelocityFor(0, 100)).toBe(-DEFAULT_MAX_SPEED_PX);
    expect(scrollVelocityFor(100, 100)).toBe(DEFAULT_MAX_SPEED_PX);
    expect(scrollVelocityFor(25, 100)).toBeLessThan(0);
    expect(scrollVelocityFor(75, 100)).toBeGreaterThan(0);
  });
});
