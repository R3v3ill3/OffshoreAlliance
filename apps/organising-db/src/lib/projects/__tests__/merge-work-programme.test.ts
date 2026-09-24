import { describe, expect, it } from "vitest";
import { mergeWorkProgramme, watchContractorDiffers, type RadarSignal } from "../merge-work-programme";
import type { UpcomingProjectRow } from "@/lib/hooks/useUpcomingProjects";

function project(partial: Partial<UpcomingProjectRow> & { id: number; external_id: string }): UpcomingProjectRow {
  return {
    source: "nopsema",
    title: "Activity",
    activity_type: "Drilling",
    lifecycle_classification: "Development",
    project_name: null,
    associated_project: null,
    organisation: "Woodside",
    region_code: "NW",
    jurisdiction: "WA",
    location_text: "North West",
    latitude: null,
    longitude: null,
    start_date: "2026-01-01",
    end_date: null,
    status: "Accepted",
    source_url: "https://example.test/ep",
    is_active: true,
    first_seen_at: "2026-01-01",
    last_seen_at: "2026-01-02",
    last_changed_at: "2026-01-02",
    match: null,
    ...partial,
  };
}

function signal(partial: Partial<RadarSignal> & { signal_id: number }): RadarSignal {
  return {
    source_layer: "regulatory",
    source: "NOPSEMA EP under assessment",
    source_key: "nopsema_ep",
    signal_type: "ep_lodged",
    occurred_at: "2026-02-01T00:00:00.000Z",
    title: "Signal",
    extract: null,
    url: "https://example.test/signal",
    confidence: 0.8,
    in_region: true,
    region_label: "North West",
    external_id: null,
    matched_terms: [],
    vessel_id: null,
    vessel_name: null,
    watch_contractor_id: null,
    watch_name: null,
    operator_id: null,
    operator_name: null,
    worksite_id: null,
    ...partial,
  };
}

describe("mergeWorkProgramme", () => {
  it("attaches a regulatory signal that shares the NOPSEMA id and does not list it twice", () => {
    const rows = mergeWorkProgramme(
      [project({ id: 1, external_id: "44" })],
      [signal({ signal_id: 9, external_id: "44", watch_name: "Saipem", title: "Same filing" })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.radar?.signal_id).toBe(9);
    expect(rows[0]?.radarOnly).toBe(false);
    expect(rows[0]?.radar_watch_name).toBe("Saipem");
  });

  it("keeps the latest signal when several share an external id", () => {
    const rows = mergeWorkProgramme(
      [project({ id: 1, external_id: "44" })],
      [
        signal({ signal_id: 1, external_id: "44", occurred_at: "2026-01-01T00:00:00.000Z" }),
        signal({ signal_id: 2, external_id: "44", occurred_at: "2026-03-01T00:00:00.000Z", signal_type: "ep_accepted" }),
      ]
    );
    expect(rows[0]?.radar?.signal_id).toBe(2);
  });

  it("appends regulatory signals that have no catalogue row", () => {
    const rows = mergeWorkProgramme(
      [project({ id: 1, external_id: "44" })],
      [signal({ signal_id: 7, external_id: null, source: "NOPTA", title: "Acreage notice" })]
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]?.radarOnly).toBe(true);
    expect(rows[1]?.id).toBe(-7);
    expect(rows[1]?.title).toBe("Acreage notice");
  });

  it("shows the watch contractor only when it is a different name", () => {
    expect(
      watchContractorDiffers({
        radar_watch_name: "Saipem",
        matched_employer_name: "Woodside",
        organisation: "Woodside",
      })
    ).toBe(true);
    expect(
      watchContractorDiffers({
        radar_watch_name: "Woodside",
        matched_employer_name: "Woodside Energy",
        organisation: "Woodside",
      })
    ).toBe(true);
    expect(
      watchContractorDiffers({
        radar_watch_name: "woodside",
        matched_employer_name: "Woodside",
        organisation: "Woodside",
      })
    ).toBe(false);
  });
});
