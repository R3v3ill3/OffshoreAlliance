import { describe, expect, it } from "vitest";
import { DEFAULT_GEOFENCES } from "../geofences";
import {
  bearingDeg,
  destinationPoint,
  distanceToGeometryNm,
  haversineNm,
  pointInGeometry,
} from "../geo";
import { classifyMovement, nextPollMinutes } from "../movement";
import type { GeofenceRef } from "../types";

const fences: GeofenceRef[] = DEFAULT_GEOFENCES.map((g, i) => ({
  geofence_id: i + 1,
  name: g.name,
  slug: g.slug,
  geometry: g.geometry,
  is_active: true,
}));

describe("NW geofences", () => {
  it("contains a North West Shelf point and excludes Bass Strait", () => {
    const carnarvon = fences[0]!;
    expect(pointInGeometry({ lng: 114.5, lat: -20.5 }, carnarvon.geometry)).toBe(true);
    expect(pointInGeometry({ lng: 146.2, lat: -39.1 }, carnarvon.geometry)).toBe(false);
    for (const fence of fences) {
      expect(pointInGeometry({ lng: 146.5, lat: -38.8 }, fence.geometry)).toBe(false);
    }
  });

  it("contains a Browse point and a Timor Sea point in their own polygons", () => {
    expect(pointInGeometry({ lng: 123, lat: -14 }, fences[1]!.geometry)).toBe(true);
    expect(pointInGeometry({ lng: 128.5, lat: -12 }, fences[2]!.geometry)).toBe(true);
    expect(pointInGeometry({ lng: 123, lat: -14 }, fences[0]!.geometry)).toBe(false);
  });
});

describe("classifyMovement", () => {
  const carnarvon = fences[0]!;

  it("raises an entry only on the transition into the polygon", () => {
    const first = classifyMovement(
      {
        position: { lng: 114.5, lat: -20.5 },
        cogDeg: 90,
        sogKn: 10,
        destination: "SINGAPORE",
        previouslyInside: [],
        satellite: false,
      },
      fences
    );
    expect(first.events.map((e) => e.type)).toContain("vessel_area_entry");
    expect(first.insideIds).toContain(carnarvon.geofence_id);

    const still = classifyMovement(
      {
        position: { lng: 114.6, lat: -20.5 },
        cogDeg: 90,
        sogKn: 10,
        destination: null,
        previouslyInside: first.insideIds,
        satellite: false,
      },
      fences
    );
    expect(still.events.find((e) => e.type === "vessel_area_entry")).toBeUndefined();
  });

  it("flags a hull whose course reaches the polygon inside the horizon", () => {
    // ~150 nm west of the polygon's western edge (112.2°E), heading east.
    const start = { lng: 109.5, lat: -20.5 };
    expect(pointInGeometry(start, carnarvon.geometry)).toBe(false);
    const result = classifyMovement(
      {
        position: start,
        cogDeg: 90,
        sogKn: 12,
        destination: "ROTTERDAM",
        previouslyInside: [],
        satellite: true,
      },
      [carnarvon]
    );
    const inbound = result.events.find((e) => e.type === "vessel_course_toward");
    expect(inbound).toBeTruthy();
    expect(inbound!.confidence).toBeGreaterThanOrEqual(0.55);
    expect(inbound!.etaHours).not.toBeNull();
  });

  it("does not treat a destination string as enough when the course points away", () => {
    const result = classifyMovement(
      {
        position: { lng: 109.5, lat: -20.5 },
        cogDeg: 270,
        sogKn: 12,
        destination: "DAMPIER",
        previouslyInside: [],
        satellite: true,
      },
      [carnarvon]
    );
    expect(result.events.find((e) => e.type === "vessel_course_toward")).toBeUndefined();
  });

  it("keeps a destination hint under the alert threshold", () => {
    // Close enough for terrestrial range, course aligned, but 72h of 2kn
    // does not reach a polygon that is still ~80nm away... use a point just
    // outside and a slow speed so the track sample misses, while bearing matches.
    const outside = { lng: 111.6, lat: -20.5 };
    expect(distanceToGeometryNm(outside, carnarvon.geometry)).toBeGreaterThan(0);
    const result = classifyMovement(
      {
        position: outside,
        cogDeg: bearingDeg(outside, { lng: 114.5, lat: -20.5 }),
        sogKn: 0.5,
        destination: "DAMPIER",
        previouslyInside: [],
        horizonHours: 6,
        satellite: false,
      },
      [carnarvon]
    );
    const hint = result.events.find((e) => e.type === "vessel_course_toward");
    // Speed is below the moving threshold, so destination alone does nothing.
    expect(hint).toBeUndefined();
  });

  it("backs off the poll when the hull is far and satellite AIS is off", () => {
    expect(nextPollMinutes(40, false)).toBe(30);
    expect(nextPollMinutes(2000, false)).toBe(24 * 60);
    expect(nextPollMinutes(2000, true)).toBeLessThan(24 * 60);
  });
});

describe("destinationPoint", () => {
  it("moves roughly east", () => {
    const next = destinationPoint({ lng: 115, lat: -20 }, 90, 60);
    expect(next.lng).toBeGreaterThan(115);
    expect(haversineNm({ lng: 115, lat: -20 }, next)).toBeGreaterThan(55);
    expect(haversineNm({ lng: 115, lat: -20 }, next)).toBeLessThan(65);
  });
});
