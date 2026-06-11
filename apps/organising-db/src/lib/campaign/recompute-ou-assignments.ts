import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@oa/db-types";

type RuleRow = {
  rule_id: number;
  ou_id: number;
  include: boolean;
  dimension_type:
    | "employer"
    | "worksite"
    | "occupation"
    | "occupation_grouping"
    | "shift"
    | "work_area"
    | "roster_panel"
    | "relational";
  operator: "equals" | "contains";
  value_int: number | null;
  value_text: string | null;
};

type WorkerRow = {
  worker_id: number;
  employer_id: number | null;
  worksite_id: number | null;
  /**
   * Resolved occupation name. Prefers the canonical occupation
   * (canonical_occupation_id → occupations.canonical_name), falling back to the
   * legacy free-text `workers.occupation` column for older data.
   */
  occupation: string | null;
  /** FK to the canonical occupation, used to look up occupation aliases. */
  canonical_occupation_id: number | null;
  /**
   * Resolved occupation grouping. Prefers the canonical occupation's group
   * (occupations.occupation_group_id → occupation_groups.name), falling back to
   * the legacy free-text `workers.classification` column.
   */
  classification: string | null;
  shift_id: number | null;
  work_area_id: number | null;
  roster_panel_id: number | null;
};

/** Raw shape returned by the PostgREST nested select before normalisation. */
type RawWorkerRow = {
  worker_id: number;
  employer_id: number | null;
  worksite_id: number | null;
  occupation: string | null;
  classification: string | null;
  shift_id: number | null;
  work_area_id: number | null;
  roster_panel_id: number | null;
  canonical_occupation_id: number | null;
  canonical_occupation?:
    | {
        canonical_name?: string | null;
        occupation_groups?: { name?: string | null } | { name?: string | null }[] | null;
      }
    | {
        canonical_name?: string | null;
        occupation_groups?: { name?: string | null } | { name?: string | null }[] | null;
      }[]
    | null;
};

/**
 * Flatten a raw worker row into a WorkerRow, resolving the canonical occupation
 * name and group from the embedded `occupations` relation. The canonical values
 * take precedence; the legacy free-text columns are used only as a fallback so
 * rules keep working for both the current data model (canonical_occupation_id)
 * and any older rows that still carry free text.
 */
function normalizeWorkerRow(raw: RawWorkerRow): WorkerRow {
  const occRel = Array.isArray(raw.canonical_occupation)
    ? raw.canonical_occupation[0]
    : raw.canonical_occupation;
  const canonicalName = occRel?.canonical_name ?? null;
  const groupRel = occRel
    ? Array.isArray(occRel.occupation_groups)
      ? occRel.occupation_groups[0]
      : occRel.occupation_groups
    : null;
  const groupName = groupRel?.name ?? null;
  return {
    worker_id: raw.worker_id,
    employer_id: raw.employer_id,
    worksite_id: raw.worksite_id,
    occupation: canonicalName ?? raw.occupation ?? null,
    canonical_occupation_id: raw.canonical_occupation_id ?? null,
    classification: groupName ?? raw.classification ?? null,
    shift_id: raw.shift_id,
    work_area_id: raw.work_area_id,
    roster_panel_id: raw.roster_panel_id,
  };
}

function matchText(
  value: string | null | undefined,
  target: string | null,
  operator: "equals" | "contains"
) {
  if (!target) return false;
  const source = (value ?? "").trim().toLowerCase();
  const needle = target.trim().toLowerCase();
  if (!needle) return false;
  return operator === "equals" ? source === needle : source.includes(needle);
}

/**
 * Match a worker against a single rule.
 *
 * For typed-dimension rules (shift / work_area / roster_panel) the rule may
 * carry either:
 *   - `value_int` → match against the typed FK on the workers table
 *     (the canonical / preferred storage), OR
 *   - `value_text` → fall back to the legacy worker_tags lookup so older
 *     rules created before the typed columns existed keep working.
 */
function matchesRule(
  worker: WorkerRow,
  rule: RuleRow,
  tagSet: Set<string>,
  aliasSet: Set<string>
) {
  switch (rule.dimension_type) {
    case "employer":
      return worker.employer_id != null && rule.value_int != null && worker.employer_id === rule.value_int;
    case "worksite":
      return worker.worksite_id != null && rule.value_int != null && worker.worksite_id === rule.value_int;
    case "occupation":
      // Match the canonical/legacy occupation name, or any of the occupation's
      // aliases — so abbreviations entered in a rule (e.g. "GSO") still match a
      // worker whose canonical occupation is "General Service Operator".
      return (
        matchText(worker.occupation, rule.value_text, rule.operator) ||
        [...aliasSet].some((alias) => matchText(alias, rule.value_text, rule.operator))
      );
    case "occupation_grouping":
      return matchText(worker.classification, rule.value_text, rule.operator);
    case "shift":
      if (rule.value_int != null) return worker.shift_id === rule.value_int;
      return rule.value_text ? tagSet.has(rule.value_text.trim().toLowerCase()) : false;
    case "work_area":
      if (rule.value_int != null) return worker.work_area_id === rule.value_int;
      return rule.value_text ? tagSet.has(rule.value_text.trim().toLowerCase()) : false;
    case "roster_panel":
      if (rule.value_int != null) return worker.roster_panel_id === rule.value_int;
      return rule.value_text ? tagSet.has(rule.value_text.trim().toLowerCase()) : false;
    case "relational":
      return rule.value_text ? tagSet.has(rule.value_text.trim().toLowerCase()) : false;
    default:
      return false;
  }
}

export async function recomputeOuAssignments(
  supabase: SupabaseClient<Database>,
  campaignId: number
) {
  const scoped = supabase as unknown as {
    from: (table: string) => {
      select: (query: string) => {
        eq: (
          column: string,
          value: unknown
        ) => Promise<{ data: unknown[] | null; error: Error | null }>;
        in: (
          column: string,
          values: number[]
        ) => Promise<{ data: unknown[] | null; error: Error | null }>;
      };
      delete: () => {
        eq: (column: string, value: unknown) => {
          in: (
            column: string,
            values: number[]
          ) => Promise<{ error: Error | null }>;
        };
      };
      insert: (
        rows: Record<string, unknown>[]
      ) => Promise<{ error: Error | null }>;
    };
  };

  const { data: members, error: membersError } = await scoped
    .from("campaign_worker_membership")
    .select(
      `worker_id, worker:workers(
        worker_id, employer_id, worksite_id, occupation, classification,
        shift_id, work_area_id, roster_panel_id, canonical_occupation_id,
        canonical_occupation:occupations!workers_canonical_occupation_id_fkey(
          canonical_name,
          occupation_groups(name)
        )
      )`
    )
    .eq("campaign_id", campaignId);
  if (membersError) throw membersError;

  type MemberRow = { worker_id?: number; worker?: RawWorkerRow | RawWorkerRow[] | null };
  const memberRows = (members ?? []) as MemberRow[];

  const workerIds = memberRows
    .map((m) => m.worker_id)
    .filter((id): id is number => Number.isFinite(id));

  if (workerIds.length === 0) {
    return { inserted: 0, removed: 0 };
  }

  const { data: rules, error: rulesError } = await scoped
    .from("campaign_unit_rules")
    .select("rule_id, ou_id, include, dimension_type, operator, value_int, value_text")
    .eq("campaign_id", campaignId);
  if (rulesError) throw rulesError;

  const allRuleRows = (rules ?? []) as RuleRow[];

  // Group container OUs (employer groups) cannot hold workers directly — the
  // database trigger rejects it. Drop any rules targeting a container so a
  // stray rule can't make the whole recompute fail.
  const { data: campaignOusRaw, error: campaignOusError } = await scoped
    .from("campaign_organising_units")
    .select("ou_id, is_group_container")
    .eq("campaign_id", campaignId);
  if (campaignOusError) throw campaignOusError;
  const campaignOuRows = (campaignOusRaw ?? []) as { ou_id: number; is_group_container?: boolean }[];
  const containerOuIds = new Set(campaignOuRows.filter((o) => o.is_group_container).map((o) => o.ou_id));
  const ruleRows = allRuleRows.filter((r) => !containerOuIds.has(r.ou_id));

  if (ruleRows.length === 0) {
    const ouIds = campaignOuRows.map((r) => r.ou_id);
    if (ouIds.length > 0) {
      const { error: clearError } = await scoped
        .from("campaign_worker_ou")
        .delete()
        .eq("assignment_source", "rule")
        .in("ou_id", ouIds);
      if (clearError) throw clearError;
    }
    return { inserted: 0, removed: 0 };
  }

  const { data: workerTagsRaw, error: tagsError } = await scoped
    .from("worker_tags")
    .select("worker_id, tag:tags(tag_name)")
    .in("worker_id", workerIds);
  if (tagsError) throw tagsError;
  const workerTags = (workerTagsRaw ?? []) as {
    worker_id: number;
    tag: { tag_name?: string } | { tag_name?: string }[] | null;
  }[];

  const tagsByWorker = new Map<number, Set<string>>();
  for (const row of workerTags) {
    const workerId = row.worker_id;
    const tagRel = row.tag;
    const tagName = Array.isArray(tagRel) ? tagRel[0]?.tag_name : tagRel?.tag_name;
    if (!tagName) continue;
    if (!tagsByWorker.has(workerId)) tagsByWorker.set(workerId, new Set());
    tagsByWorker.get(workerId)?.add(tagName.trim().toLowerCase());
  }

  const workers: WorkerRow[] = memberRows
    .map((m) => (Array.isArray(m.worker) ? m.worker[0] : m.worker))
    .filter((w): w is RawWorkerRow => !!w)
    .map(normalizeWorkerRow);

  // Occupation aliases let an occupation rule match abbreviations / source-system
  // spellings (e.g. a rule value of "GSO" matching a worker whose canonical
  // occupation is "General Service Operator"). Build occupation_id → aliases,
  // then resolve to worker_id → aliases for the matching loop.
  const occupationIds = [
    ...new Set(
      workers
        .map((w) => w.canonical_occupation_id)
        .filter((id): id is number => Number.isFinite(id))
    ),
  ];
  const aliasesByOccupation = new Map<number, Set<string>>();
  if (occupationIds.length > 0) {
    const { data: aliasRaw, error: aliasError } = await scoped
      .from("occupation_aliases")
      .select("occupation_id, alias_name")
      .in("occupation_id", occupationIds);
    if (aliasError) throw aliasError;
    for (const row of (aliasRaw ?? []) as { occupation_id: number; alias_name: string | null }[]) {
      const name = row.alias_name?.trim().toLowerCase();
      if (!name) continue;
      if (!aliasesByOccupation.has(row.occupation_id)) {
        aliasesByOccupation.set(row.occupation_id, new Set());
      }
      aliasesByOccupation.get(row.occupation_id)?.add(name);
    }
  }
  const aliasesByWorker = new Map<number, Set<string>>();
  for (const w of workers) {
    if (w.canonical_occupation_id == null) continue;
    const set = aliasesByOccupation.get(w.canonical_occupation_id);
    if (set) aliasesByWorker.set(w.worker_id, set);
  }

  const rulesByOu = new Map<number, RuleRow[]>();
  for (const rule of ruleRows) {
    if (!rulesByOu.has(rule.ou_id)) rulesByOu.set(rule.ou_id, []);
    rulesByOu.get(rule.ou_id)?.push(rule);
  }

  const desiredRows: { ou_id: number; worker_id: number }[] = [];
  for (const [ouId, ouRules] of rulesByOu.entries()) {
    const includeRules = ouRules.filter((r) => r.include);
    const excludeRules = ouRules.filter((r) => !r.include);
    for (const worker of workers) {
      const tagSet = tagsByWorker.get(worker.worker_id) ?? new Set<string>();
      const aliasSet = aliasesByWorker.get(worker.worker_id) ?? new Set<string>();
      const includeMatch =
        includeRules.length === 0 ||
        includeRules.some((r) => matchesRule(worker, r, tagSet, aliasSet));
      if (!includeMatch) continue;
      const excluded = excludeRules.some((r) => matchesRule(worker, r, tagSet, aliasSet));
      if (excluded) continue;
      desiredRows.push({ ou_id: ouId, worker_id: worker.worker_id });
    }
  }

  // Clear rule-sourced assignments for every non-container OU in the campaign
  // (not just the ones with current matches) so that a now-unmatched OU — e.g.
  // after its last rule is deleted or edited to match nobody — has its stale
  // rule rows withdrawn. Manual assignments (assignment_source = 'manual') are
  // never touched.
  const clearableOuIds = campaignOuRows
    .map((r) => r.ou_id)
    .filter((id) => !containerOuIds.has(id));

  if (clearableOuIds.length > 0) {
    const { error: clearError } = await scoped
      .from("campaign_worker_ou")
      .delete()
      .eq("assignment_source", "rule")
      .in("ou_id", clearableOuIds);
    if (clearError) throw clearError;
  }

  if (desiredRows.length === 0) {
    return { inserted: 0, removed: 0 };
  }

  const insertRows = desiredRows.map((r) => ({
    ou_id: r.ou_id,
    worker_id: r.worker_id,
    is_primary: false,
    assignment_source: "rule",
  }));

  const { error: insertError } = await scoped.from("campaign_worker_ou").insert(insertRows);
  if (insertError) throw insertError;

  return { inserted: insertRows.length, removed: 0 };
}
