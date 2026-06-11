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
  occupation: string | null;
  classification: string | null;
  shift_id: number | null;
  work_area_id: number | null;
  roster_panel_id: number | null;
};

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
function matchesRule(worker: WorkerRow, rule: RuleRow, tagSet: Set<string>) {
  switch (rule.dimension_type) {
    case "employer":
      return worker.employer_id != null && rule.value_int != null && worker.employer_id === rule.value_int;
    case "worksite":
      return worker.worksite_id != null && rule.value_int != null && worker.worksite_id === rule.value_int;
    case "occupation":
      return matchText(worker.occupation, rule.value_text, rule.operator);
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
      "worker_id, worker:workers(worker_id, employer_id, worksite_id, occupation, classification, shift_id, work_area_id, roster_panel_id)"
    )
    .eq("campaign_id", campaignId);
  if (membersError) throw membersError;

  type MemberRow = { worker_id?: number; worker?: WorkerRow | WorkerRow[] | null };
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
    .filter((w): w is WorkerRow => !!w);

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
      const includeMatch =
        includeRules.length === 0 || includeRules.some((r) => matchesRule(worker, r, tagSet));
      if (!includeMatch) continue;
      const excluded = excludeRules.some((r) => matchesRule(worker, r, tagSet));
      if (excluded) continue;
      desiredRows.push({ ou_id: ouId, worker_id: worker.worker_id });
    }
  }

  const targetOuIds = [...new Set(desiredRows.map((r) => r.ou_id))];

  if (targetOuIds.length > 0) {
    const { error: clearError } = await scoped
      .from("campaign_worker_ou")
      .delete()
      .eq("assignment_source", "rule")
      .in("ou_id", targetOuIds);
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
