/**
 * The single resolution path for employer and worksite strings on an import
 * (DA0.3 plan §2.4). Order per distinct folded string:
 *
 *   1. rejected memory  — a reviewer said "not an employer / worksite"
 *   2. exact            — the folded string equals a canonical or trading name
 *   3. alias            — the folded string equals a saved alias
 *   4. fuzzy            — @oa/employer-matching at its 0.92 auto / 0.65
 *                         candidate thresholds → auto | needs_review | unmatched
 *   5. never create     — there is no branch that yields a new row
 *
 * `resolveNames` is pure (unit-tested); `resolveAndQueue` loads the reference
 * set and, when asked to persist, writes the auto aliases and the queue rows
 * with the service-role client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NAME_MATCH_THRESHOLDS,
  proposeNameMatch,
  type NameCandidate,
} from "@oa/employer-matching";
import { foldName } from "./name-fold";
import {
  isQueuedOutcome,
  type NameEntity,
  type ResolutionOutcome,
  type ResolutionProposal,
} from "./resolve-names-types";

export type {
  NameEntity,
  ResolutionOutcome,
  ResolutionProposal,
  ResolutionStatus,
} from "./resolve-names-types";

export interface ReferenceRow {
  id: number;
  name: string;
  /** Trading name(s); scored like the name for exact and fuzzy. */
  altNames: (string | null)[];
  /** Principal employer: +0.05 in the fuzzy step. */
  boost: boolean;
  /** Inactive rows are exact / alias targets but not fuzzy candidates. */
  isActive: boolean;
}

export interface ReferenceAlias {
  id: number;
  aliasName: string;
}

export interface RejectedName {
  normalisedName: string;
}

export interface ReferenceSet {
  rows: ReferenceRow[];
  aliases: ReferenceAlias[];
  rejected: RejectedName[];
}

interface Grouped {
  rawName: string;
  normalisedName: string;
  occurrences: number;
}

function addTo(map: Map<string, Set<number>>, key: string, id: number): void {
  const set = map.get(key);
  if (set) set.add(id);
  else map.set(key, new Set([id]));
}

/** Distinct folded strings in first-seen order, with the raw string first seen. */
export function groupRawNames(rawNames: readonly (string | null | undefined)[]): Grouped[] {
  const out = new Map<string, Grouped>();
  for (const raw of rawNames) {
    if (typeof raw !== "string") continue;
    const normalisedName = foldName(raw);
    if (normalisedName.length === 0) continue;
    const existing = out.get(normalisedName);
    if (existing) existing.occurrences += 1;
    else out.set(normalisedName, { rawName: raw.trim(), normalisedName, occurrences: 1 });
  }
  return [...out.values()];
}

export function resolveNames(
  entity: NameEntity,
  rawNames: readonly (string | null | undefined)[],
  ref: ReferenceSet
): ResolutionOutcome[] {
  void entity; // the reference set is already entity-specific; kept for call-site clarity
  const rowById = new Map<number, ReferenceRow>();
  const exactByFold = new Map<string, Set<number>>();
  const aliasByFold = new Map<string, Set<number>>();
  const aliasesByRow = new Map<number, string[]>();
  const rejected = new Set(ref.rejected.map((r) => r.normalisedName));

  for (const row of ref.rows) {
    rowById.set(row.id, row);
    const nameFold = foldName(row.name);
    if (nameFold) addTo(exactByFold, nameFold, row.id);
    for (const alt of row.altNames) {
      if (!alt) continue;
      const altFold = foldName(alt);
      if (altFold) addTo(exactByFold, altFold, row.id);
    }
  }
  for (const alias of ref.aliases) {
    if (!rowById.has(alias.id)) continue; // alias of a row outside the set (never a target)
    const fold = foldName(alias.aliasName);
    if (!fold) continue;
    addTo(aliasByFold, fold, alias.id);
    const list = aliasesByRow.get(alias.id);
    if (list) list.push(alias.aliasName);
    else aliasesByRow.set(alias.id, [alias.aliasName]);
  }

  // Built once per call, only if a string reaches the fuzzy step.
  let fuzzyCandidates: NameCandidate[] | null = null;
  const candidates = (): NameCandidate[] => {
    if (fuzzyCandidates) return fuzzyCandidates;
    fuzzyCandidates = ref.rows
      .filter((row) => row.isActive)
      .map((row) => ({
        id: row.id,
        name: row.name,
        altNames: [...row.altNames, ...(aliasesByRow.get(row.id) ?? [])],
        boost: row.boost,
        isPrincipal: row.boost,
      }));
    return fuzzyCandidates;
  };

  const proposalsFor = (ids: Iterable<number>): ResolutionProposal[] =>
    [...ids]
      .map((id) => rowById.get(id))
      .filter((row): row is ReferenceRow => row != null)
      .sort((a, b) => a.id - b.id)
      .slice(0, NAME_MATCH_THRESHOLDS.TOP_N)
      .map((row) => ({ id: row.id, name: row.name, score: 1, is_principal: row.boost }));

  const outcomes: ResolutionOutcome[] = [];
  for (const group of groupRawNames(rawNames)) {
    const base = {
      rawName: group.rawName,
      normalisedName: group.normalisedName,
      occurrences: group.occurrences,
      score: null as number | null,
      method: null as ResolutionOutcome["method"],
      proposals: [] as ResolutionProposal[],
      resolvedId: null as number | null,
      resolvedName: null as string | null,
      writesAlias: false,
    };

    // 1. Rejected memory beats everything (sticky decision, plan §2.3.3).
    if (rejected.has(group.normalisedName)) {
      outcomes.push({ ...base, status: "rejected" });
      continue;
    }

    // 2. Exact (canonical or trading name).
    const exactIds = exactByFold.get(group.normalisedName);
    if (exactIds && exactIds.size === 1) {
      const [id] = exactIds;
      outcomes.push({
        ...base,
        status: "exact",
        resolvedId: id,
        resolvedName: rowById.get(id)!.name,
        method: "exact",
      });
      continue;
    }
    if (exactIds && exactIds.size > 1) {
      // A fold collision between two rows (trading names are not unique):
      // both at 1.0, so the dominance gap sends it to review.
      outcomes.push({ ...base, status: "needs_review", score: 1, proposals: proposalsFor(exactIds) });
      continue;
    }

    // 3. Alias.
    const aliasIds = aliasByFold.get(group.normalisedName);
    if (aliasIds && aliasIds.size === 1) {
      const [id] = aliasIds;
      outcomes.push({
        ...base,
        status: "alias",
        resolvedId: id,
        resolvedName: rowById.get(id)!.name,
        method: "alias",
      });
      continue;
    }
    if (aliasIds && aliasIds.size > 1) {
      // The pre-DA1.4 ambiguity case: one folded alias on more than one row.
      outcomes.push({ ...base, status: "needs_review", score: 1, proposals: proposalsFor(aliasIds) });
      continue;
    }

    // 4. Fuzzy, over active rows with trading names and aliases as alternates.
    const outcome = proposeNameMatch(group.rawName, candidates());
    if (outcome.status === "auto" && outcome.id != null) {
      const row = rowById.get(outcome.id)!;
      const canonicalFolds = [row.name, ...row.altNames].filter(Boolean).map((n) => foldName(n as string));
      outcomes.push({
        ...base,
        status: "auto",
        resolvedId: row.id,
        resolvedName: row.name,
        score: outcome.score,
        method: "fuzzy",
        proposals: outcome.proposals,
        writesAlias: !canonicalFolds.includes(group.normalisedName),
      });
      continue;
    }
    if (outcome.status === "needs_review") {
      outcomes.push({
        ...base,
        status: "needs_review",
        score: outcome.proposals[0]?.score ?? null,
        proposals: outcome.proposals,
      });
      continue;
    }
    // 5. Never create.
    outcomes.push({ ...base, status: "unmatched" });
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Server wrapper
// ---------------------------------------------------------------------------

// The app's server clients are `SupabaseClient<any>`; the wrapper takes the same shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any>;

export async function loadReferenceSet(admin: Supa, entity: NameEntity): Promise<ReferenceSet> {
  if (entity === "employer") {
    const [rows, aliases, rejected] = await Promise.all([
      admin
        .from("employers")
        .select("employer_id, employer_name, trading_name, employer_category, is_active"),
      admin.from("employer_name_aliases").select("employer_id, alias_name"),
      admin.from("name_match_reviews").select("normalised_name").eq("entity", "employer").eq("status", "rejected"),
    ]);
    if (rows.error) throw new Error(`Could not load employers: ${rows.error.message}`);
    if (aliases.error) throw new Error(`Could not load employer aliases: ${aliases.error.message}`);
    if (rejected.error) throw new Error(`Could not load rejected names: ${rejected.error.message}`);
    return {
      rows: (rows.data ?? []).map((r) => ({
        id: Number(r.employer_id),
        name: String(r.employer_name),
        altNames: [r.trading_name == null ? null : String(r.trading_name)],
        boost: r.employer_category === "Principal_Employer",
        isActive: r.is_active !== false,
      })),
      aliases: (aliases.data ?? []).map((a) => ({ id: Number(a.employer_id), aliasName: String(a.alias_name) })),
      rejected: (rejected.data ?? []).map((r) => ({ normalisedName: String(r.normalised_name) })),
    };
  }
  const [rows, aliases, rejected] = await Promise.all([
    admin.from("worksites").select("worksite_id, worksite_name, is_active"),
    admin.from("worksite_name_aliases").select("worksite_id, alias_name"),
    admin.from("name_match_reviews").select("normalised_name").eq("entity", "worksite").eq("status", "rejected"),
  ]);
  if (rows.error) throw new Error(`Could not load worksites: ${rows.error.message}`);
  if (aliases.error) throw new Error(`Could not load worksite aliases: ${aliases.error.message}`);
  if (rejected.error) throw new Error(`Could not load rejected names: ${rejected.error.message}`);
  return {
    rows: (rows.data ?? []).map((r) => ({
      id: Number(r.worksite_id),
      name: String(r.worksite_name),
      altNames: [],
      boost: false,
      isActive: r.is_active !== false,
    })),
    aliases: (aliases.data ?? []).map((a) => ({ id: Number(a.worksite_id), aliasName: String(a.alias_name) })),
    rejected: (rejected.data ?? []).map((r) => ({ normalisedName: String(r.normalised_name) })),
  };
}

export interface ResolveAndQueueInput {
  entity: NameEntity;
  rawNames: readonly (string | null | undefined)[];
  /** The import_logs row the queue rows belong to; required to persist. */
  importId: number | null;
  userId: string;
  persist: boolean;
  /** {import_type, weekly_batch_id, source_kinds} — stored on every queue row. */
  sourceContext: Record<string, unknown>;
  /** Occurrences by folded string when the caller counted them (e.g. per row, not per distinct string). */
  occurrences?: Map<string, number>;
  /** Companion string (worksite for an employer string, or vice versa) by folded string. */
  otherRawByName?: Map<string, string | null>;
}

export interface ResolveAndQueueResult {
  outcomes: ResolutionOutcome[];
  queued: number;
  aliasesWritten: number;
}

export async function resolveAndQueue(admin: Supa, input: ResolveAndQueueInput): Promise<ResolveAndQueueResult> {
  const ref = await loadReferenceSet(admin, input.entity);
  const outcomes = resolveNames(input.entity, input.rawNames, ref).map((o) => ({
    ...o,
    occurrences: input.occurrences?.get(o.normalisedName) ?? o.occurrences,
  }));
  const queued = outcomes.filter((o) => isQueuedOutcome(o.status)).length;
  if (!input.persist || input.importId == null) {
    return { outcomes, queued, aliasesWritten: 0 };
  }

  // Queue rows first, aliases second: a failure in the upsert leaves nothing
  // behind (the route removes the import_logs row it created); an alias
  // written before a later failure is an idempotent fact the next run would
  // write again, so it is left in place.
  const rows = outcomes
    .filter((o) => o.status === "auto" || isQueuedOutcome(o.status))
    .map((o) => ({
      entity: input.entity,
      raw_name: o.rawName.trim(),
      normalised_name: o.normalisedName,
      import_id: input.importId,
      status: o.status,
      match_score: o.score,
      match_method: o.status === "auto" ? "fuzzy" : null,
      candidate_proposals: o.proposals,
      resolved_employer_id: input.entity === "employer" && o.status === "auto" ? o.resolvedId : null,
      resolved_worksite_id: input.entity === "worksite" && o.status === "auto" ? o.resolvedId : null,
      occurrences: o.occurrences,
      source_context: {
        ...input.sourceContext,
        other_raw_name: input.otherRawByName?.get(o.normalisedName) ?? null,
      },
      created_by: input.userId,
    }));
  if (rows.length > 0) {
    const { error } = await admin
      .from("name_match_reviews")
      .upsert(rows, { onConflict: "import_id,entity,normalised_name" });
    if (error) throw new Error(`Could not queue ${input.entity} names: ${error.message}`);
  }

  const aliasTable = input.entity === "employer" ? "employer_name_aliases" : "worksite_name_aliases";
  const fkColumn = input.entity === "employer" ? "employer_id" : "worksite_id";
  let aliasesWritten = 0;
  for (const o of outcomes) {
    if (o.status !== "auto" || !o.writesAlias || o.resolvedId == null) continue;
    const { error } = await admin.from(aliasTable).insert({
      [fkColumn]: o.resolvedId,
      alias_name: o.rawName.trim(),
      source: "import",
      created_by: input.userId,
    });
    if (!error) aliasesWritten += 1;
    // 23505: the per-row unique index (lower(btrim(alias_name))) already holds it.
    else if (error.code !== "23505") throw new Error(`Could not write ${input.entity} alias "${o.rawName}": ${error.message}`);
  }
  return { outcomes, queued, aliasesWritten };
}
