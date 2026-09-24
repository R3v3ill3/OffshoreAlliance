/**
 * Shared types for the mobilisation radar.
 *
 * Signals are the normalised event. Alerts are rule firings over one or
 * more signals. Vessels and geofences are master data; contractors and
 * operators are existing `employers` rows, linked when a name resolves.
 */

export type SourceLayer = "regulatory" | "commercial" | "ais";

export type SignalType =
  | "ep_lodged"
  | "ep_varied"
  | "ep_accepted"
  | "activity_notification"
  | "enforcement"
  | "award"
  | "news"
  | "vessel_area_entry"
  | "vessel_area_exit"
  | "vessel_course_toward";

export type VesselType =
  | "pipelay"
  | "heavy_lift"
  | "dsv"
  | "survey"
  | "usv"
  | "rock_install"
  | "dredger"
  | "fpso"
  | "construction"
  | "other";

export type VesselRelevance = "nw" | "global" | "low";

export type AlertPriority = "low" | "normal" | "high" | "critical";

export type AlertStatus = "new" | "acknowledged" | "snoozed" | "dismissed";

export type KeywordKind = "region" | "operator" | "project" | "general";

export type DigestCadence = "off" | "daily" | "weekly";

export interface LngLat {
  lng: number;
  lat: number;
}

/** GeoJSON polygon. Coordinates are [lng, lat], outer ring first. */
export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface GeoMultiPolygon {
  type: "MultiPolygon";
  coordinates: [number, number][][][];
}

export type GeofenceGeometry = GeoPolygon | GeoMultiPolygon;

export interface GeofenceRef {
  geofence_id: number;
  name: string;
  slug: string;
  geometry: GeofenceGeometry;
  is_active: boolean;
}

export interface WatchContractor {
  watch_id: number;
  canonical_name: string;
  aliases: string[];
  employer_id: number | null;
  asx_ticker: string | null;
  tier: "core" | "adjacent";
  is_active: boolean;
}

export interface WatchVessel {
  vessel_id: number;
  name: string;
  imo: string | null;
  owner_name: string;
  owner_operator_id: number | null;
  relevance: VesselRelevance;
  is_active: boolean;
}

export interface WatchKeyword {
  keyword_id: number;
  keyword: string;
  kind: KeywordKind;
  asx_ticker: string | null;
  is_active: boolean;
}

export interface WorksiteRef {
  worksite_id: number;
  worksite_name: string;
  operator_id: number | null;
}

export interface Watchlist {
  contractors: WatchContractor[];
  vessels: WatchVessel[];
  keywords: WatchKeyword[];
  worksites: WorksiteRef[];
}

export interface EntityMatch {
  contractors: WatchContractor[];
  vessels: WatchVessel[];
  operators: WatchKeyword[];
  regions: WatchKeyword[];
  projects: WatchKeyword[];
  /** True when the text names Australia or a configured region/project term. */
  australiaOrProject: boolean;
  sevenFleet: boolean;
}

export interface SignalDraft {
  source_layer: SourceLayer;
  source: string;
  source_key: string;
  signal_type: SignalType;
  occurred_at: string;
  title: string;
  extract: string | null;
  url: string | null;
  confidence: number;
  in_region: boolean;
  vessel_id: number | null;
  contractor_id: number | null;
  watch_contractor_id: number | null;
  operator_id: number | null;
  worksite_id: number | null;
  geofence_id: number | null;
  sector_id: number | null;
  dedup_key: string;
  fingerprint: string;
  external_id: string | null;
  matched_terms: string[];
  region_label: string | null;
  /** Estimated or observed arrival. Null when the source does not give one. */
  arrival_at?: string | null;
  /** End of the stay when a source states a date or a duration. */
  ends_at?: string | null;
  also_seen?: { source: string; url: string | null; at: string }[];
}

export interface SignalView {
  signal_id: number;
  source_layer: SourceLayer;
  source: string;
  signal_type: SignalType;
  occurred_at: string;
  detected_at: string;
  title: string;
  confidence: number;
  in_region: boolean;
  vessel_id: number | null;
  contractor_id: number | null;
  watch_contractor_id: number | null;
  operator_id: number | null;
  worksite_id: number | null;
  geofence_id: number | null;
  dedup_key: string;
  fingerprint: string;
  url: string | null;
}

export interface RuleRow {
  rule_id: number;
  code: string;
  name: string;
  enabled: boolean;
  priority: AlertPriority;
  config: {
    minConfidence?: number;
    windowDays?: number;
    minLayers?: number;
  };
}

export interface ExistingAlert {
  alert_id: number;
  dedup_key: string;
  status: AlertStatus;
  dismissed_at: string | null;
  priority: AlertPriority;
}

export interface AlertDraft {
  rule_code: string;
  rule_id: number;
  dedup_key: string;
  priority: AlertPriority;
  title: string;
  summary: string;
  confidence: number;
  contractor_id: number | null;
  watch_contractor_id: number | null;
  vessel_id: number | null;
  operator_id: number | null;
  worksite_id: number | null;
  signal_ids: number[];
}

export interface AisPosition {
  imo: string | null;
  mmsi: string | null;
  name: string | null;
  lat: number;
  lng: number;
  sogKn: number | null;
  cogDeg: number | null;
  destination: string | null;
  eta: string | null;
  observedAt: string;
  source: string;
}

export interface AisVesselMaster {
  imo: string | null;
  mmsi: string | null;
  name: string;
  type: string | null;
}
