/**
 * Server-side loader for the AI situation-analysis endpoints. Pulls
 * everything the model is allowed to see (campaign basics, employers
 * with parent/child, worksites, agreements, member counts, prior
 * campaigns at the same employers) into a single text block. There is
 * NO external/web research — every line of context is sourced from the
 * organising DB so the prompt can run with the same factual-discipline
 * guardrails as the existing comms-drafting routes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export interface InternalContext {
  text: string;
  knownEmployerIds: Set<number>;
  knownAgreementIds: Set<number>;
  knownWorksiteIds: Set<number>;
}

export async function loadInternalContext(
  supabase: SupabaseLike,
  campaignId: number
): Promise<InternalContext> {
  const knownEmployerIds = new Set<number>();
  const knownAgreementIds = new Set<number>();
  const knownWorksiteIds = new Set<number>();
  const lines: string[] = [];

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "campaign_id, name, description, campaign_type, status, campaign_scope, sector_wide, total_worker_estimate, start_date, end_date, plan_timeframe_weeks, enterprise_agreement_subtype"
    )
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (!campaign)
    return {
      text: "",
      knownEmployerIds,
      knownAgreementIds,
      knownWorksiteIds,
    };

  lines.push(`Campaign: ${campaign.name} (#${campaign.campaign_id})`);
  if (campaign.description) lines.push(`  Description: ${campaign.description}`);
  lines.push(
    `  Type: ${campaign.campaign_type}; status: ${campaign.status}; scope: ${campaign.campaign_scope ?? "unset"}`
  );
  if (campaign.enterprise_agreement_subtype) {
    lines.push(`  EA subtype: ${campaign.enterprise_agreement_subtype}`);
  }
  if (campaign.total_worker_estimate != null) {
    lines.push(`  Total worker estimate: ${campaign.total_worker_estimate}`);
  }
  if (campaign.start_date || campaign.end_date) {
    lines.push(
      `  Dates: ${campaign.start_date ?? "?"} → ${campaign.end_date ?? "?"} (${campaign.plan_timeframe_weeks ?? "?"} weeks)`
    );
  }

  // Employers + parents
  const { data: employerLinks } = await supabase
    .from("campaign_employers")
    .select("employer_id")
    .eq("campaign_id", campaignId);
  const employerIds: number[] = (employerLinks ?? []).map(
    (l: { employer_id: number }) => l.employer_id
  );
  for (const id of employerIds) knownEmployerIds.add(id);

  if (employerIds.length > 0) {
    const { data: employers } = await supabase
      .from("employers")
      .select("employer_id, name, parent_employer_id, employer_category, abn")
      .in("employer_id", employerIds);
    const parentIds = Array.from(
      new Set(
        (employers ?? [])
          .map(
            (e: { parent_employer_id: number | null }) => e.parent_employer_id
          )
          .filter((id: number | null): id is number => id != null)
      )
    );
    let parents: { employer_id: number; name: string }[] = [];
    if (parentIds.length > 0) {
      const { data: parentRows } = await supabase
        .from("employers")
        .select("employer_id, name")
        .in("employer_id", parentIds);
      parents = parentRows ?? [];
      for (const p of parents) knownEmployerIds.add(p.employer_id);
    }
    const parentLookup = new Map(parents.map((p) => [p.employer_id, p.name]));
    lines.push("Campaign employers:");
    for (const e of employers ?? []) {
      const parent = e.parent_employer_id
        ? parentLookup.get(e.parent_employer_id)
        : null;
      lines.push(
        `  - #${e.employer_id} ${e.name}${e.employer_category ? ` (${e.employer_category})` : ""}${parent ? ` [parent: ${parent} #${e.parent_employer_id}]` : ""}`
      );
    }
  }

  // Worksites
  const { data: worksiteLinks } = await supabase
    .from("campaign_worksites")
    .select("worksite_id, sector_wide")
    .eq("campaign_id", campaignId);
  const worksiteIds: number[] = (worksiteLinks ?? [])
    .map((l: { worksite_id: number | null }) => l.worksite_id)
    .filter((id: number | null): id is number => id != null);
  for (const id of worksiteIds) knownWorksiteIds.add(id);
  if (worksiteIds.length > 0) {
    const { data: worksites } = await supabase
      .from("worksites")
      .select("worksite_id, name")
      .in("worksite_id", worksiteIds);
    if (worksites && worksites.length > 0) {
      lines.push(
        `Worksites: ${worksites.map((w: { worksite_id: number; name: string }) => `${w.name} (#${w.worksite_id})`).join(", ")}`
      );
    }
  } else if (
    (worksiteLinks ?? []).some((l: { sector_wide: boolean }) => l.sector_wide)
  ) {
    lines.push("Worksites: sector-wide (no discrete worksites)");
  }

  // Agreements
  const { data: agreementLinks } = await supabase
    .from("campaign_agreements")
    .select("agreement_id, relationship_type, is_primary")
    .eq("campaign_id", campaignId);
  const agreementIds: number[] = (agreementLinks ?? []).map(
    (l: { agreement_id: number }) => l.agreement_id
  );
  for (const id of agreementIds) knownAgreementIds.add(id);
  if (agreementIds.length > 0) {
    const { data: agreements } = await supabase
      .from("agreements")
      .select("agreement_id, name, expiry_date")
      .in("agreement_id", agreementIds);
    const linkLookup = new Map(
      (agreementLinks ?? []).map(
        (l: {
          agreement_id: number;
          relationship_type: string;
          is_primary: boolean;
        }) => [l.agreement_id, l]
      )
    );
    lines.push("Agreements:");
    for (const a of agreements ?? []) {
      const link = linkLookup.get(a.agreement_id) as
        | { relationship_type: string; is_primary: boolean }
        | undefined;
      lines.push(
        `  - ${a.name} (#${a.agreement_id}) [${link?.relationship_type ?? "?"}${link?.is_primary ? ", primary" : ""}]${a.expiry_date ? ` expires ${a.expiry_date}` : ""}`
      );
    }
  }

  // Worker counts
  const { count: memberCount } = await supabase
    .from("campaign_worker_membership")
    .select("worker_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (memberCount != null) {
    lines.push(`Workers in campaign: ${memberCount}`);
  }

  // Prior campaigns at the same employers
  if (employerIds.length > 0) {
    const { data: priorLinks } = await supabase
      .from("campaign_employers")
      .select("campaign_id")
      .in("employer_id", employerIds);
    const priorIds = Array.from(
      new Set(
        (priorLinks ?? [])
          .map((l: { campaign_id: number }) => l.campaign_id)
          .filter((id: number) => id !== campaignId)
      )
    ).slice(0, 12);
    if (priorIds.length > 0) {
      const { data: priorCampaigns } = await supabase
        .from("campaigns")
        .select("campaign_id, name, status, campaign_type")
        .in("campaign_id", priorIds)
        .eq("is_sms_episode", false);
      if (priorCampaigns && priorCampaigns.length > 0) {
        lines.push("Prior campaigns at these employers:");
        for (const p of priorCampaigns) {
          lines.push(
            `  - ${p.name} (#${p.campaign_id}) [${p.campaign_type}, ${p.status}]`
          );
        }
      }
    }
  }

  return {
    text: lines.join("\n"),
    knownEmployerIds,
    knownAgreementIds,
    knownWorksiteIds,
  };
}
