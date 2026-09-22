import type { AisPosition, AisVesselMaster } from "./types";

export interface AisProvider {
  id: string;
  /** True when this tier can see a hull still in the open ocean. */
  satellite: boolean;
  searchByName(name: string): Promise<AisVesselMaster[]>;
  positionByImo(imo: string): Promise<AisPosition | null>;
}

export interface AisEnv {
  provider: string;
  apiKey: string | null;
  satellite: boolean;
}

export function readAisEnv(env: NodeJS.ProcessEnv = process.env): AisEnv {
  const provider = (env.AIS_PROVIDER || "datalastic").toLowerCase();
  const apiKey = env.DATALASTIC_API_KEY || env.AIS_API_KEY || null;
  const satellite = env.AIS_SATELLITE === "1" || env.AIS_SATELLITE === "true";
  return { provider, apiKey, satellite };
}

/**
 * MVP provider is Datalastic (vessel-by-IMO and name search). Other vendors
 * are selected with AIS_PROVIDER but only Datalastic is implemented; the
 * poller records that and skips rather than pretending coverage exists.
 * AIS_SATELLITE widens the poll radius. It does not switch vendor.
 */
export function createAisProvider(env: AisEnv, fetchImpl: typeof fetch = fetch): AisProvider | null {
  if (!env.apiKey) return null;
  if (env.provider !== "datalastic") return null;
  return new DatalasticProvider(env.apiKey, env.satellite, fetchImpl);
}

class DatalasticProvider implements AisProvider {
  id = "datalastic";
  constructor(
    private apiKey: string,
    readonly satellite: boolean,
    private fetchImpl: typeof fetch
  ) {}

  async searchByName(name: string): Promise<AisVesselMaster[]> {
    const url = new URL("https://api.datalastic.com/api/v0/vessel_find");
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("name", name);
    const body = await this.getJson(url);
    const rows = asArray(body);
    return rows
      .map((row) => ({
        imo: str(row.imo),
        mmsi: str(row.mmsi),
        name: str(row.name) || name,
        type: str(row.type) || str(row.vessel_type),
      }))
      .filter((row) => row.name);
  }

  async positionByImo(imo: string): Promise<AisPosition | null> {
    const url = new URL("https://api.datalastic.com/api/v0/vessel");
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("imo", imo);
    const body = await this.getJson(url);
    return normalizeDatalasticPosition(body, "datalastic");
  }

  private async getJson(url: URL): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": "OffshoreAllianceMobilisation/1.0" },
    });
    if (!response.ok) {
      throw new Error(`Datalastic ${response.status} for ${url.pathname}`);
    }
    return response.json();
  }
}

export function normalizeDatalasticPosition(body: unknown, source: string): AisPosition | null {
  const row = unwrapData(body);
  if (!row) return null;
  const lat = num(row.lat ?? row.latitude);
  const lng = num(row.lon ?? row.lng ?? row.longitude);
  if (lat == null || lng == null) return null;
  const observed = str(row.last_position_UTC) || str(row.last_position_epoch) || str(row.timestamp);
  return {
    imo: str(row.imo),
    mmsi: str(row.mmsi),
    name: str(row.name),
    lat,
    lng,
    sogKn: num(row.speed ?? row.sog),
    cogDeg: num(row.course ?? row.cog),
    destination: str(row.destination),
    eta: str(row.eta_UTC) || str(row.eta),
    observedAt: observed ? safeIso(observed) : new Date().toISOString(),
    source,
  };
}

function unwrapData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const data = record.data ?? record;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function asArray(body: unknown): Record<string, unknown>[] {
  const data = unwrapData(body);
  if (!body || typeof body !== "object") return data ? [data] : [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.data)) {
    return record.data.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  }
  return data ? [data] : [];
}

function str(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function safeIso(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  const asNum = Number(value);
  if (Number.isFinite(asNum) && asNum > 1_000_000_000) {
    return new Date(asNum > 10_000_000_000 ? asNum : asNum * 1000).toISOString();
  }
  return new Date().toISOString();
}
