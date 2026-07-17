/**
 * Shared row types for the Activists & WOCs module. Sourced from the
 * generated Supabase types where a table/view maps 1:1.
 */
import type { Database } from "@oa/db-types";

export type ActivistProfileRow =
  Database["public"]["Tables"]["campaign_activist_profiles"]["Row"];
export type ActivistProfileUpdate =
  Database["public"]["Tables"]["campaign_activist_profiles"]["Update"];

export type ActivistRegisterRow =
  Database["public"]["Views"]["v_campaign_activist_register"]["Row"];

export type ActivistTaskRow =
  Database["public"]["Tables"]["activist_tasks"]["Row"];
export type ActivistTaskInsert =
  Database["public"]["Tables"]["activist_tasks"]["Insert"];
export type ActivistTaskUpdate =
  Database["public"]["Tables"]["activist_tasks"]["Update"];

export type CampaignWocRow = Database["public"]["Tables"]["campaign_wocs"]["Row"];
export type WocMemberRow = Database["public"]["Tables"]["woc_members"]["Row"];
export type WocMeetingRow =
  Database["public"]["Tables"]["woc_committee_meetings"]["Row"];

export type StructureTestRow =
  Database["public"]["Tables"]["structure_tests"]["Row"];
export type StructureTestResultRow =
  Database["public"]["Tables"]["structure_test_results"]["Row"];

export type OuCoverageRow =
  Database["public"]["Tables"]["campaign_ou_coverage"]["Row"];
export type CoverageMapRow =
  Database["public"]["Views"]["v_campaign_coverage_map"]["Row"];
export type CoverageSummaryRow =
  Database["public"]["Views"]["v_campaign_coverage_summary"]["Row"];
export type WocUnitRepresentationRow =
  Database["public"]["Views"]["v_woc_unit_representation"]["Row"];

/** Minimal campaign-member shape for pickers (name + worker id). */
export type WorkerOption = {
  worker_id: number;
  first_name: string;
  last_name: string;
};

export function workerOptionName(w: WorkerOption): string {
  return `${w.first_name} ${w.last_name}`;
}
