import {
  angleDelta,
  bearingDeg,
  centroid,
  destinationPoint,
  distanceToGeometryNm,
  pointInGeometry,
  trackEntersGeometry,
} from "./geo";
import type { GeofenceRef, LngLat } from "./types";
import { clamp01, destinationStrength } from "./text";

export interface MovementEvent {
  type: "vessel_area_entry" | "vessel_area_exit" | "vessel_course_toward";
  geofence_id: number;
  geofence_name: string;
  confidence: number;
  reason: string;
  etaHours: number | null;
}

export interface MovementInput {
  position: LngLat;
  cogDeg: number | null;
  sogKn: number | null;
  destination: string | null;
  /** Geofences the previous fix was inside. Null when this is the first fix. */
  previouslyInside: number[];
  horizonHours?: number;
  /** When satellite AIS is off, destination-only hints are ignored beyond this range. */
  satellite: boolean;
}

const HORIZON_HOURS = 72;
const MIN_SPEED_KN = 1;

/**
 * Entry, exit, and the inbound heuristic.
 *
 * AIS destination text is free-text and is never enough on its own. A course
 * that actually reaches the polygon inside the horizon is the inbound
 * trigger. Destination text only adds confidence when the course also points
 * at the geofence.
 */
export function classifyMovement(
  input: MovementInput,
  geofences: GeofenceRef[]
): { events: MovementEvent[]; insideIds: number[] } {
  const active = geofences.filter((g) => g.is_active);
  const insideIds = active
    .filter((g) => pointInGeometry(input.position, g.geometry))
    .map((g) => g.geofence_id);
  const events: MovementEvent[] = [];
  const previous = new Set(input.previouslyInside);

  for (const id of insideIds) {
    if (previous.has(id)) continue;
    const fence = active.find((g) => g.geofence_id === id)!;
    events.push({
      type: "vessel_area_entry",
      geofence_id: id,
      geofence_name: fence.name,
      confidence: 0.82,
      reason: `Position is inside ${fence.name}.`,
      etaHours: 0,
    });
  }

  for (const id of input.previouslyInside) {
    if (insideIds.includes(id)) continue;
    const fence = active.find((g) => g.geofence_id === id);
    if (!fence) continue;
    events.push({
      type: "vessel_area_exit",
      geofence_id: id,
      geofence_name: fence.name,
      confidence: 0.7,
      reason: `Position has left ${fence.name}.`,
      etaHours: null,
    });
  }

  const speed = input.sogKn ?? 0;
  const course = input.cogDeg;
  if (speed >= MIN_SPEED_KN && course != null) {
    const horizon = input.horizonHours ?? HORIZON_HOURS;
    const reachNm = speed * horizon;
    for (const fence of active) {
      if (insideIds.includes(fence.geofence_id)) continue;
      const track = trackEntersGeometry(input.position, course, reachNm, fence.geometry);
      const centre = centroid(fence.geometry);
      const bearing = bearingDeg(input.position, centre);
      const aligned = angleDelta(course, bearing) <= 70;
      const dest = destinationStrength(input.destination);
      const rangeNm = distanceToGeometryNm(input.position, fence.geometry);
      const maxDestRange = input.satellite ? 2500 : 400;

      if (track.enters) {
        const etaHours = track.distanceNm != null ? track.distanceNm / speed : null;
        let confidence = 0.68;
        if (dest === "strong" && aligned) confidence += 0.08;
        events.push({
          type: "vessel_course_toward",
          geofence_id: fence.geofence_id,
          geofence_name: fence.name,
          confidence: clamp01(confidence),
          reason: `Course ${Math.round(course)}° at ${speed.toFixed(1)} kn reaches ${fence.name} inside ${horizon}h.`,
          etaHours,
        });
        continue;
      }

      // Destination is a hint, not a trigger. Require a course that points
      // at the region and a position already in the band this AIS tier can
      // trust. Confidence stays under the default alert threshold.
      if (dest === "strong" && aligned && rangeNm <= maxDestRange && rangeNm > 0) {
        events.push({
          type: "vessel_course_toward",
          geofence_id: fence.geofence_id,
          geofence_name: fence.name,
          confidence: 0.45,
          reason: `Declared destination "${input.destination}" and course point toward ${fence.name}, but the projected track does not enter within ${horizon}h. Destination text is unreliable.`,
          etaHours: speed > 0 ? rangeNm / speed : null,
        });
      }
    }
  }

  return { events, insideIds };
}

/** Poll less often once a hull is far from every geofence, to save AIS credits. */
export function nextPollMinutes(distanceNm: number, satellite: boolean): number {
  if (distanceNm <= 150) return 30;
  if (distanceNm <= 500) return satellite ? 60 : 180;
  if (satellite && distanceNm <= 2500) return 180;
  return satellite ? 360 : 24 * 60;
}

export function projectLabel(point: LngLat, cog: number | null, hours: number, sog: number | null): LngLat | null {
  if (cog == null || sog == null || sog < MIN_SPEED_KN) return null;
  return destinationPoint(point, cog, sog * hours);
}
