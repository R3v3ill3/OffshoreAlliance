import WebSocket from "ws";
import { boundingBox } from "./geo";
import { fold } from "./text";
import type { GeofenceGeometry } from "./types";

const STREAM_URL = "wss://stream.aisstream.io/v0/stream";

const MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "ShipStaticData",
  "StaticDataReport",
];

export interface StreamVessel {
  vessel_id: number;
  name: string;
  imo: string | null;
  mmsi: string | null;
}

export interface AisStreamHit {
  kind: "position" | "static";
  mmsi: string | null;
  imo: string | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
  sogKn: number | null;
  cogDeg: number | null;
  destination: string | null;
  observedAt: string;
}

/** One AISStream bounding box: two [lat, lng] corners. */
export type AisStreamBox = [[number, number], [number, number]];

export function readAisStreamKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const dedicated = env.AISSTREAM_API_KEY?.trim();
  if (dedicated) return dedicated;
  if ((env.AIS_PROVIDER || "").toLowerCase() === "aisstream" && env.AIS_API_KEY?.trim()) {
    return env.AIS_API_KEY.trim();
  }
  return null;
}

export function listenSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AISSTREAM_LISTEN_SECONDS || 90);
  if (!Number.isFinite(raw)) return 90;
  return Math.min(200, Math.max(20, Math.round(raw)));
}

/**
 * One box around the active geofences, padded so a hull is seen as it nears
 * the boundary. AISStream only delivers terrestrial coverage, so this is the
 * North-West coastal and shelf area, not the open ocean.
 */
export function listenBoxes(
  geofences: { geometry: GeofenceGeometry; is_active: boolean }[]
): AisStreamBox[] {
  const active = geofences.filter((fence) => fence.is_active);
  if (active.length === 0) return [[[-8, 109], [-25, 134]]];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const fence of active) {
    const box = boundingBox(fence.geometry);
    minLng = Math.min(minLng, box.minLng);
    minLat = Math.min(minLat, box.minLat);
    maxLng = Math.max(maxLng, box.maxLng);
    maxLat = Math.max(maxLat, box.maxLat);
  }
  const north = clamp(maxLat + 1.5, -80, 10);
  const south = clamp(minLat - 1.5, -45, 10);
  const west = clamp(minLng - 1.5, 100, 160);
  const east = clamp(maxLng + 1.5, 100, 160);
  return [[[north, west], [south, east]]];
}

export function parseAisStreamMessage(body: unknown, nowIso: string): AisStreamHit | null {
  if (!body || typeof body !== "object") return null;
  const envelope = body as Record<string, unknown>;
  const type = typeof envelope.MessageType === "string" ? envelope.MessageType : "";
  if (!MESSAGE_TYPES.includes(type)) return null;
  const meta = asRecord(envelope.MetaData);
  const message = asRecord(asRecord(envelope.Message)[type]);
  const reportA = asRecord(message.ReportA);
  const mmsi = cleanMmsi(meta.MMSI ?? message.UserID);
  const imo = cleanImo(message.ImoNumber ?? message.IMO);
  const name = cleanName(message.Name ?? reportA.Name ?? meta.ShipName);
  const lat = cleanCoord(message.Latitude ?? meta.Latitude, 90);
  const lng = cleanCoord(message.Longitude ?? meta.Longitude, 180);
  const kind = type === "ShipStaticData" || type === "StaticDataReport" ? "static" : "position";
  if (!mmsi && !imo && !name && lat == null) return null;
  return {
    kind,
    mmsi,
    imo,
    name,
    lat,
    lng,
    sogKn: cleanSpeed(message.Sog ?? message.SOG),
    cogDeg: cleanCourse(message.Cog ?? message.COG),
    destination: cleanName(message.Destination),
    observedAt: parseAisTime(meta.time_utc, nowIso),
  };
}

export function matchStreamVessel(vessels: StreamVessel[], hit: AisStreamHit): StreamVessel | null {
  if (hit.mmsi) {
    const byMmsi = vessels.find((vessel) => vessel.mmsi === hit.mmsi);
    if (byMmsi) return byMmsi;
  }
  if (hit.imo) {
    const byImo = vessels.find((vessel) => vessel.imo === hit.imo);
    if (byImo) return byImo;
  }
  const name = fold(hit.name ?? "");
  if (name.length < 4 || /spread|fleet/.test(name)) return null;
  const named = vessels.filter((vessel) => fold(vessel.name) === name);
  return named.length === 1 ? named[0]! : null;
}

export interface StreamListenResult {
  hits: AisStreamHit[];
  messages: number;
  confirmed: boolean;
  error: string | null;
}

export function collectAisStream(input: {
  apiKey: string;
  boxes: AisStreamBox[];
  listenMs: number;
  now?: () => string;
}): Promise<StreamListenResult> {
  const now = input.now ?? (() => new Date().toISOString());
  return new Promise((resolve) => {
    const hits: AisStreamHit[] = [];
    let messages = 0;
    let confirmed = false;
    let error: string | null = null;
    let settled = false;
    const socket = new WebSocket(STREAM_URL, { perMessageDeflate: true });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      resolve({ hits, messages, confirmed, error });
    };
    const timer = setTimeout(finish, input.listenMs);

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          APIKey: input.apiKey,
          BoundingBoxes: input.boxes,
          FilterMessageTypes: MESSAGE_TYPES,
        })
      );
    });
    socket.on("message", (data) => {
      messages += 1;
      const text = frameText(data);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return;
      }
      const record = asRecord(body);
      if (record.MessageType === "SubscriptionConfirmation") {
        confirmed = true;
        return;
      }
      if (typeof record.error === "string" && !error) error = record.error;
      const hit = parseAisStreamMessage(body, now());
      if (hit) hits.push(hit);
    });
    socket.on("error", (err) => {
      error = err.message || "AISStream connection failed";
      finish();
    });
    socket.on("close", (code, reason) => {
      const why = reason.toString();
      if (!confirmed && !error) {
        error = why || (code === 1000 ? null : `AISStream closed (${code})`);
      }
      finish();
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function cleanMmsi(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{9}$/.test(digits) ? digits : null;
}

function cleanImo(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{7}$/.test(digits) || digits === "0000000") return null;
  return digits;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/@/g, " ").replace(/\s+/g, " ").trim();
  return name.length > 1 ? name : null;
}

function cleanCoord(value: unknown, limit: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  if (limit === 90 && Math.abs(n) > 90) return null;
  return n;
}

function cleanSpeed(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 102) return null;
  return n;
}

function cleanCourse(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 360) return null;
  return n;
}

function parseAisTime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const normalized = value
    .trim()
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(" +0000 UTC", "Z")
    .replace(" UTC", "Z")
    .replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function frameText(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}
