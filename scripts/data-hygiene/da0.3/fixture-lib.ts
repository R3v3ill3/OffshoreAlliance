/**
 * DA0.3 replay fixture — the pure part, shared by build-fixture.ts (writes the
 * files) and apps/organising-db/src/lib/import/__tests__/replay-fixture.test.ts
 * (the harness that asserts the counts). Organisation strings only.
 *
 * Imports the app's resolver by relative path so the fixture and the
 * product use one implementation.
 */

import { foldName } from "../../../apps/organising-db/src/lib/import/name-fold";
import {
  resolveNames,
  type ReferenceSet,
  type ResolutionOutcome,
} from "../../../apps/organising-db/src/lib/import/resolve-names";

export interface ReferenceEmployersFile {
  exported_at: string;
  rows: { employer_id: number; employer_name: string; trading_name: string | null; employer_category: string | null; is_active: boolean }[];
  aliases: { employer_id: number; alias_name: string; source: string }[];
}

export interface ReferenceWorksitesFile {
  exported_at: string;
  rows: { worksite_id: number; worksite_name: string; worksite_type: string; is_active: boolean }[];
  aliases: { worksite_id: number; alias_name: string; source: string }[];
}

export interface VariantsFile {
  lineage: {
    employers: { raw: string; canonical_id: number; canonical_name: string }[];
    worksites: { raw: string; canonical_id: number; canonical_name: string }[];
  };
  synthetic: { canonicals_per_entity: number };
  rows: { target: number };
}

export interface VariantString {
  raw: string;
  /** The row the reviewer would map a queued variant to. */
  canonicalId: number;
  origin: "lineage" | "synthetic";
}

export function referenceSetFromEmployers(file: ReferenceEmployersFile): ReferenceSet {
  return {
    rows: file.rows.map((r) => ({
      id: r.employer_id,
      name: r.employer_name,
      altNames: [r.trading_name],
      boost: r.employer_category === "Principal_Employer",
      isActive: r.is_active,
    })),
    aliases: file.aliases.map((a) => ({ id: a.employer_id, aliasName: a.alias_name })),
    rejected: [],
  };
}

export function referenceSetFromWorksites(file: ReferenceWorksitesFile): ReferenceSet {
  return {
    rows: file.rows.map((r) => ({
      id: r.worksite_id,
      name: r.worksite_name,
      altNames: [],
      boost: false,
      isActive: r.is_active,
    })),
    aliases: file.aliases.map((a) => ({ id: a.worksite_id, aliasName: a.alias_name })),
    rejected: [],
  };
}

const PTY_LTD = /\s+pty\.?\s*ltd\.?\s*$/i;

/** Deterministic case / spacing / suffix variants of `count` canonical names. */
export function syntheticVariants(
  ref: ReferenceSet,
  count: number,
  entity: "employer" | "worksite"
): VariantString[] {
  const active = ref.rows.filter((r) => r.isActive).sort((a, b) => a.id - b.id);
  const picked = Array.from({ length: count }, (_, i) => active[(i * 9) % active.length]);
  const out: VariantString[] = [];
  for (const row of picked) {
    const name = row.name;
    const variants = [
      name.toUpperCase(),
      name.toLowerCase(),
      name.replace(/\s+/g, "  "),
      `${name}\t`,
      `${name} Pty Ltd`,
    ];
    if (PTY_LTD.test(name)) variants.push(name.replace(PTY_LTD, ""));
    if (entity === "employer") variants.push(`${name}: Site`);
    for (const raw of variants) out.push({ raw, canonicalId: row.id, origin: "synthetic" });
  }
  return out;
}

export interface EntityFixture {
  entity: "employer" | "worksite";
  ref: ReferenceSet;
  /** Every distinct string the file carries for this entity: canonical names first, then variants. */
  strings: string[];
  variants: VariantString[];
}

export function buildEntityFixture(
  entity: "employer" | "worksite",
  ref: ReferenceSet,
  lineage: { raw: string; canonical_id: number }[],
  syntheticCount: number
): EntityFixture {
  const variants: VariantString[] = [
    ...lineage.map((v) => ({ raw: v.raw, canonicalId: v.canonical_id, origin: "lineage" as const })),
    ...syntheticVariants(ref, syntheticCount, entity),
  ];
  const seen = new Set<string>();
  const strings: string[] = [];
  for (const raw of [...ref.rows.map((r) => r.name), ...variants.map((v) => v.raw)]) {
    const key = foldName(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    strings.push(raw);
  }
  return { entity, ref, strings, variants };
}

export interface StatusCounts {
  exact: number;
  alias: number;
  auto: number;
  needs_review: number;
  unmatched: number;
  rejected: number;
}

export function countStatuses(outcomes: readonly ResolutionOutcome[]): StatusCounts {
  const counts: StatusCounts = { exact: 0, alias: 0, auto: 0, needs_review: 0, unmatched: 0, rejected: 0 };
  for (const o of outcomes) counts[o.status] += 1;
  return counts;
}

export interface Decision {
  raw: string;
  normalisedName: string;
  status: "needs_review" | "unmatched";
  canonicalId: number;
  canonicalName: string;
}

export interface EntityExpectation {
  distinctStrings: number;
  firstPass: StatusCounts;
  autoAliasesWritten: number;
  queued: number;
  decisions: Decision[];
  /**
   * Folded names carried by more than one row of the reference itself (a
   * canonical or trading name shared by two rows — the duplicates DA1.1
   * retires). The resolver sends those to review on every pass; no alias can
   * decide them, so they are the only queue rows a second replay may leave.
   */
  referenceCollisions: string[];
  secondPass: StatusCounts;
  /** Second-pass queue rows that are NOT reference collisions: must be 0. */
  secondPassQueuedFromVariants: number;
}

/** Folded names that two or more reference rows carry (canonical or trading names). */
export function referenceFoldCollisions(ref: ReferenceSet): string[] {
  const owners = new Map<string, Set<number>>();
  for (const row of ref.rows) {
    for (const name of [row.name, ...row.altNames]) {
      if (!name) continue;
      const key = foldName(name);
      if (!key) continue;
      const set = owners.get(key) ?? new Set<number>();
      set.add(row.id);
      owners.set(key, set);
    }
  }
  return [...owners.entries()].filter(([, ids]) => ids.size > 1).map(([key]) => key).sort();
}

/**
 * First pass over the file's strings; the "decisions" the reviewer would
 * make (each queued variant → its canonical, as an alias); second pass with
 * those aliases in the reference set. The second pass must leave nothing
 * queued (plan §5 row: "on a second replay zero queue rows").
 */
export function computeExpectation(fx: EntityFixture): EntityExpectation {
  const first = resolveNames(fx.entity, fx.strings, fx.ref);
  const ids = new Set(fx.ref.rows.map((r) => r.id));
  for (const o of first) {
    if (o.resolvedId != null && !ids.has(o.resolvedId)) {
      throw new Error(`resolver returned a row outside the reference set: ${o.rawName}`);
    }
  }
  const collisions = referenceFoldCollisions(fx.ref);
  const collisionSet = new Set(collisions);
  const canonicalByFold = new Map(fx.variants.map((v) => [foldName(v.raw), v.canonicalId]));
  const nameById = new Map(fx.ref.rows.map((r) => [r.id, r.name]));
  const decisions: Decision[] = [];
  for (const o of first) {
    if (o.status !== "needs_review" && o.status !== "unmatched") continue;
    if (collisionSet.has(o.normalisedName)) continue; // the reference's own duplicate: DA1.1, not an alias
    const canonicalId = canonicalByFold.get(o.normalisedName);
    if (canonicalId == null) throw new Error(`queued string without a known canonical: ${o.rawName}`);
    decisions.push({
      raw: o.rawName,
      normalisedName: o.normalisedName,
      status: o.status,
      canonicalId,
      canonicalName: nameById.get(canonicalId) ?? String(canonicalId),
    });
  }
  const ref2: ReferenceSet = {
    ...fx.ref,
    aliases: [
      ...fx.ref.aliases,
      // what the resolver wrote for auto accepts …
      ...first.filter((o) => o.status === "auto" && o.writesAlias).map((o) => ({ id: o.resolvedId!, aliasName: o.rawName })),
      // … and what the reviewer's decisions write
      ...decisions.map((d) => ({ id: d.canonicalId, aliasName: d.raw })),
    ],
  };
  const second = resolveNames(fx.entity, fx.strings, ref2);
  const secondQueued = second.filter((o) => o.status === "needs_review" || o.status === "unmatched");
  return {
    distinctStrings: first.length,
    firstPass: countStatuses(first),
    autoAliasesWritten: first.filter((o) => o.status === "auto" && o.writesAlias).length,
    queued: first.filter((o) => o.status === "needs_review" || o.status === "unmatched").length,
    decisions,
    referenceCollisions: collisions,
    secondPass: countStatuses(second),
    secondPassQueuedFromVariants: secondQueued.filter((o) => !collisionSet.has(o.normalisedName)).length,
  };
}

export interface FixtureRow {
  "Reference ID": string;
  "First Name": string;
  "Last Name": string;
  "Member Account Status": string;
  "Company Name": string;
  "Employee Worksite": string;
  "Job Title": string;
  Phone: string;
  Email: string;
}

const STATUS_CYCLE = ["Active", "Unfinancial", "Resigned", "Active", "Stopped Payment"];

/** status_sync layout (membership-import-types.ts), one row per (employer string × worksite string) pair. */
export function buildRows(employerStrings: string[], worksiteStrings: string[], target: number): FixtureRow[] {
  const rows: FixtureRow[] = [];
  const total = Math.max(target, employerStrings.length, worksiteStrings.length);
  for (let i = 0; i < total; i++) {
    const n = i + 1;
    rows.push({
      "Reference ID": `DA03-${String(n).padStart(6, "0")}`,
      "First Name": "Fixture",
      "Last Name": `Person ${n}`,
      "Member Account Status": STATUS_CYCLE[i % STATUS_CYCLE.length],
      "Company Name": employerStrings[i % employerStrings.length],
      "Employee Worksite": worksiteStrings[(i * 7) % worksiteStrings.length],
      "Job Title": "Fixture Trade",
      Phone: "",
      Email: `da03-${n}@example.invalid`,
    });
  }
  return rows;
}
