import type { Jurisdiction } from "../parsers/jurisdiction";

export interface NormalisedUpcomingProject {
  source: "nopsema";
  external_id: string;
  title: string | null;
  activity_type: string | null;
  lifecycle_classification: string | null;
  project_name: string | null;
  associated_project: string | null;
  organisation: string | null;
  region_code: string | null;
  jurisdiction: Jurisdiction | null;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  source_url: string;
  raw_payload: Record<string, unknown>;
}

export interface SourceAdapter {
  id: "nopsema";
  fetchAll(): Promise<NormalisedUpcomingProject[]>;
}
