import type { GeofenceGeometry, LngLat } from "./types";

const NM_PER_DEG_LAT = 60;

export function ringsOf(geometry: GeofenceGeometry): [number, number][][] {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.flat();
}

export function pointInRing(point: LngLat, ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Outer rings only. Holes are not used by the seeded geofences. */
export function pointInGeometry(point: LngLat, geometry: GeofenceGeometry): boolean {
  const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]!] : geometry.coordinates.map((p) => p[0]!);
  return rings.some((ring) => ring && pointInRing(point, ring));
}

export function haversineNm(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destinationPoint(start: LngLat, bearingDeg: number, distanceNm: number): LngLat {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const angular = distanceNm / 3440.065;
  const br = toRad(bearingDeg);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 };
}

export function bearingDeg(from: LngLat, to: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function angleDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function centroid(geometry: GeofenceGeometry): LngLat {
  const ring = ringsOf(geometry)[0] ?? [];
  const unique = ring.length > 1 && samePoint(ring[0]!, ring[ring.length - 1]!) ? ring.slice(0, -1) : ring;
  if (unique.length === 0) return { lng: 0, lat: 0 };
  const sum = unique.reduce(
    (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
    { lng: 0, lat: 0 }
  );
  return { lng: sum.lng / unique.length, lat: sum.lat / unique.length };
}

function samePoint(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8;
}

/** Minimum distance from a point to a sampled boundary. Good enough for poll backoff. */
export function distanceToGeometryNm(point: LngLat, geometry: GeofenceGeometry): number {
  if (pointInGeometry(point, geometry)) return 0;
  let min = Infinity;
  for (const ring of ringsOf(geometry)) {
    for (const [lng, lat] of ring) {
      min = Math.min(min, haversineNm(point, { lng, lat }));
    }
  }
  return min;
}

export function boundingBox(geometry: GeofenceGeometry): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of ringsOf(geometry)) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Walk `distanceNm` along `bearingDeg` in ~stepNm samples and report whether
 * any sample lands inside the geometry, plus the distance to the first hit.
 */
export function trackEntersGeometry(
  start: LngLat,
  bearingDegValue: number,
  distanceNm: number,
  geometry: GeofenceGeometry,
  stepNm = 15
): { enters: boolean; distanceNm: number | null } {
  if (distanceNm <= 0) return { enters: false, distanceNm: null };
  const steps = Math.max(1, Math.ceil(distanceNm / stepNm));
  for (let i = 1; i <= steps; i++) {
    const dist = Math.min(distanceNm, i * stepNm);
    const p = destinationPoint(start, bearingDegValue, dist);
    if (pointInGeometry(p, geometry)) return { enters: true, distanceNm: dist };
  }
  return { enters: false, distanceNm: null };
}

/** Rough nm-per-degree of longitude at a latitude, for tests and labels. */
export function nmPerDegLng(lat: number): number {
  return NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}
