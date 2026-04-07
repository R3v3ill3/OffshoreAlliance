import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@oa/db-types";

interface WtpRow {
  wtp_id: number;
  plan_id: number;
  wtp_category_id: number;
  wtp_option_id: number | null;
  custom_text: string | null;
  is_exclusion: boolean | null;
  wtp_categories?: { category_name: string } | null;
  wtp_options?: { option_text: string } | null;
}

interface ExistingCandidate {
  source_wtp_id: number | null;
  status: string;
}

interface ExistingOu {
  name: string;
}

/**
 * Generates OU candidate suggestions from a campaign's Where-to-Play selections.
 * Only creates suggestions for WTP rows that don't already have a candidate or matching OU.
 */
export async function generateOuCandidatesFromWtp(
  supabase: SupabaseClient<Database>,
  campaignId: number
) {
  const { data: wtpRows, error: wtpErr } = await supabase
    .from("plan_where_to_play")
    .select(
      `wtp_id, plan_id, wtp_category_id, wtp_option_id, custom_text, is_exclusion,
       wtp_categories:wtp_categories(category_name),
       wtp_options:wtp_options(option_text)`
    )
    .in(
      "plan_id",
      (
        await supabase
          .from("campaign_stage_plans")
          .select("plan_id")
          .eq("campaign_id", campaignId)
      ).data?.map((r) => r.plan_id) ?? []
    );

  if (wtpErr || !wtpRows) return { generated: 0, error: wtpErr };

  const { data: existingCandidates } = await supabase
    .from("campaign_ou_candidates")
    .select("source_wtp_id, status")
    .eq("campaign_id", campaignId);

  const { data: existingOus } = await supabase
    .from("campaign_organising_units")
    .select("name")
    .eq("campaign_id", campaignId);

  const candidateWtpIds = new Set(
    (existingCandidates ?? [])
      .filter((c: ExistingCandidate) => c.status !== "rejected")
      .map((c: ExistingCandidate) => c.source_wtp_id)
      .filter(Boolean)
  );

  const existingOuNames = new Set(
    (existingOus ?? []).map((o: ExistingOu) => o.name.toLowerCase())
  );

  const candidates: {
    campaign_id: number;
    suggested_name: string;
    suggested_ou_type: string;
    source: string;
    source_wtp_id: number;
    estimated_workers: number | null;
    commonality_logic: string | null;
  }[] = [];

  for (const row of wtpRows as WtpRow[]) {
    if (row.is_exclusion) continue;
    if (candidateWtpIds.has(row.wtp_id)) continue;

    const catRaw = row.wtp_categories;
    const catName = (
      Array.isArray(catRaw)
        ? (catRaw[0] as { category_name: string } | undefined)?.category_name
        : (catRaw as { category_name: string } | null)?.category_name
    )?.toLowerCase() ?? "";

    const optRaw = row.wtp_options;
    const optionText =
      row.custom_text ||
      (Array.isArray(optRaw)
        ? (optRaw[0] as { option_text: string } | undefined)?.option_text
        : (optRaw as { option_text: string } | null)?.option_text) ||
      "";

    if (!optionText) continue;

    let suggestedName = optionText;
    let suggestedOuType = "network";
    let source = "manual";
    let commonality: string | null = null;

    if (catName.includes("worksite") || catName.includes("geographic")) {
      suggestedOuType = "worksite";
      source = "wtp_worksite";
      commonality = `Workers at ${optionText}`;
    } else if (catName.includes("sector") || catName.includes("work group")) {
      suggestedOuType = "job_type";
      source = "wtp_sector";
      commonality = `Workers in the ${optionText} sector/trade`;
    } else if (catName.includes("employer")) {
      suggestedOuType = "department";
      source = "wtp_employer";
      suggestedName = `${optionText} workers`;
      commonality = `Workers employed by ${optionText}`;
    } else if (catName.includes("contact") || catName.includes("potential")) {
      suggestedOuType = "network";
      source = "wtp_contact_group";
      commonality = `Contact group: ${optionText}`;
    } else {
      continue;
    }

    if (existingOuNames.has(suggestedName.toLowerCase())) continue;

    candidates.push({
      campaign_id: campaignId,
      suggested_name: suggestedName,
      suggested_ou_type: suggestedOuType,
      source,
      source_wtp_id: row.wtp_id,
      estimated_workers: null,
      commonality_logic: commonality,
    });
  }

  if (candidates.length === 0) return { generated: 0, error: null };

  const { error: insErr } = await supabase
    .from("campaign_ou_candidates")
    .insert(candidates);

  return { generated: candidates.length, error: insErr };
}
