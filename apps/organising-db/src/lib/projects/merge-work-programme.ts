import type { UpcomingProjectRow } from "@/lib/hooks/useUpcomingProjects";

/** A mobilisation signal reduced to the fields the work programme and activity sheet show. */
export interface RadarSignal {
  signal_id: number;
  source_layer: string;
  source: string;
  source_key: string | null;
  signal_type: string;
  occurred_at: string;
  title: string;
  extract: string | null;
  url: string | null;
  confidence: number;
  in_region: boolean;
  region_label: string | null;
  external_id: string | null;
  matched_terms: string[] | null;
  vessel_id: number | null;
  vessel_name: string | null;
  watch_contractor_id: number | null;
  watch_name: string | null;
  operator_id: number | null;
  operator_name: string | null;
  worksite_id: number | null;
}

export interface WorkProgrammeRow extends UpcomingProjectRow {
  latitude: number | null;
  longitude: number | null;
  /** Latest regulatory signal that shares this activity's NOPSEMA id, when one exists. */
  radar: RadarSignal | null;
  /** True when the row exists only as a radar signal (under assessment, notice, NOPTA). */
  radarOnly: boolean;
  matched_employer_name: string | null;
  radar_watch_name: string | null;
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Watch-contractor label is worth showing when it is not already the matched employer. */
export function watchContractorDiffers(row: {
  radar_watch_name?: string | null;
  matched_employer_name?: string | null;
  organisation?: string | null;
}): boolean {
  const watch = row.radar_watch_name;
  if (!watch) return false;
  if (sameName(watch, row.matched_employer_name)) return false;
  if (!row.matched_employer_name && sameName(watch, row.organisation)) return false;
  return true;
}

function latestByExternalId(signals: RadarSignal[]): Map<string, RadarSignal> {
  const map = new Map<string, RadarSignal>();
  for (const signal of signals) {
    if (signal.source_layer !== "regulatory" || !signal.external_id) continue;
    const prev = map.get(signal.external_id);
    if (!prev || signal.occurred_at > prev.occurred_at) map.set(signal.external_id, signal);
  }
  return map;
}

function radarOnlyRow(signal: RadarSignal): WorkProgrammeRow {
  return {
    id: -signal.signal_id,
    source: signal.source_key ?? signal.source,
    external_id: signal.external_id ?? `signal-${signal.signal_id}`,
    title: signal.title,
    activity_type: signal.signal_type.replaceAll("_", " "),
    lifecycle_classification: null,
    project_name: null,
    associated_project: null,
    organisation: signal.watch_name ?? signal.operator_name,
    region_code: null,
    jurisdiction: null,
    location_text: signal.region_label,
    latitude: null,
    longitude: null,
    start_date: null,
    end_date: null,
    status: null,
    source_url: signal.url ?? "",
    is_active: true,
    first_seen_at: signal.occurred_at,
    last_seen_at: signal.occurred_at,
    last_changed_at: signal.occurred_at,
    match: null,
    radar: signal,
    radarOnly: true,
    matched_employer_name: null,
    radar_watch_name: signal.watch_name,
  };
}

/**
 * Catalogue rows stay the system of record. A regulatory signal with the same
 * NOPSEMA id is attached rather than listed twice. Regulatory signals with no
 * catalogue row (under assessment, notices, NOPTA) are appended.
 */
export function mergeWorkProgramme(
  projects: UpcomingProjectRow[],
  signals: RadarSignal[]
): WorkProgrammeRow[] {
  const byExternal = latestByExternalId(signals);
  const used = new Set<string>();

  const catalogue: WorkProgrammeRow[] = projects.map((project) => {
    const radar = byExternal.get(project.external_id) ?? null;
    if (radar?.external_id) used.add(radar.external_id);
    const matched = project.match?.matched_employer?.employer_name ?? null;
    return {
      ...project,
      latitude: project.latitude ?? null,
      longitude: project.longitude ?? null,
      radar,
      radarOnly: false,
      matched_employer_name: matched,
      radar_watch_name: radar?.watch_name ?? null,
    };
  });

  const extras: WorkProgrammeRow[] = [];
  const seenSignal = new Set<number>();
  for (const signal of signals) {
    if (signal.source_layer !== "regulatory") continue;
    if (signal.external_id && used.has(signal.external_id)) continue;
    const key = signal.external_id
      ? byExternal.get(signal.external_id)?.signal_id
      : signal.signal_id;
    if (key == null || seenSignal.has(key)) continue;
    if (signal.external_id && byExternal.get(signal.external_id)?.signal_id !== signal.signal_id) {
      continue;
    }
    seenSignal.add(signal.signal_id);
    extras.push(radarOnlyRow(signal));
  }

  extras.sort((a, b) => (b.radar?.occurred_at ?? "").localeCompare(a.radar?.occurred_at ?? ""));
  return [...catalogue, ...extras];
}
