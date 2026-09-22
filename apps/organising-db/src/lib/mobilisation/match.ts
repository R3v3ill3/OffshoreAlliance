import type { EntityMatch, Watchlist, WorksiteRef } from "./types";
import { containsPhrase, mentionsSevenFleet } from "./text";

export function matchEntities(text: string, watch: Watchlist): EntityMatch {
  const contractors = watch.contractors.filter(
    (c) =>
      c.is_active &&
      (containsPhrase(text, c.canonical_name) || c.aliases.some((a) => containsPhrase(text, a)))
  );
  const vessels = watch.vessels.filter((v) => v.is_active && containsPhrase(text, v.name));
  const operators = watch.keywords.filter(
    (k) => k.is_active && k.kind === "operator" && containsPhrase(text, k.keyword)
  );
  const regions = watch.keywords.filter(
    (k) => k.is_active && k.kind === "region" && containsPhrase(text, k.keyword)
  );
  const projects = watch.keywords.filter(
    (k) => k.is_active && k.kind === "project" && containsPhrase(text, k.keyword)
  );
  const sevenFleet = mentionsSevenFleet(text);
  const australiaOrProject =
    regions.length > 0 ||
    projects.length > 0 ||
    operators.length > 0 ||
    /\baustralia\b/i.test(text);
  return {
    contractors,
    vessels,
    operators,
    regions,
    projects,
    australiaOrProject,
    sevenFleet,
  };
}

export function matchedTerms(match: EntityMatch): string[] {
  const terms = [
    ...match.contractors.map((c) => c.canonical_name),
    ...match.vessels.map((v) => v.name),
    ...match.operators.map((k) => k.keyword),
    ...match.regions.map((k) => k.keyword),
    ...match.projects.map((k) => k.keyword),
  ];
  if (match.sevenFleet && !terms.includes("Seven fleet")) terms.push("Seven fleet");
  return [...new Set(terms)];
}

/**
 * Prefer the contractor named in the text. A vessel mention implies its
 * owner when the text did not name a contractor directly.
 */
export function primaryContractorId(match: EntityMatch): number | null {
  const named = match.contractors.find((c) => c.employer_id != null);
  if (named?.employer_id) return named.employer_id;
  const viaVessel = match.vessels.find((v) => v.owner_operator_id != null);
  return viaVessel?.owner_operator_id ?? null;
}

export function primaryVesselId(match: EntityMatch): number | null {
  return match.vessels[0]?.vessel_id ?? null;
}

/**
 * The watchlist row, even when it is not yet linked to an employers row.
 * Fusion groups on this so a Saipem EP and a Saipem award meet before anyone
 * has confirmed the employer link.
 */
export function primaryWatchContractor(match: EntityMatch, watch: Watchlist) {
  if (match.contractors[0]) return match.contractors[0];
  if (match.sevenFleet) {
    const subsea = watch.contractors.find((c) => /subsea\s*7/i.test(c.canonical_name));
    if (subsea) return subsea;
  }
  const owner = match.vessels[0]?.owner_name;
  if (!owner) return null;
  return (
    watch.contractors.find(
      (c) =>
        c.canonical_name.toLowerCase() === owner.toLowerCase() ||
        c.aliases.some((a) => a.toLowerCase() === owner.toLowerCase())
    ) ?? null
  );
}

/** Operator keywords are not employer rows. Resolve via the worksite list. */
export function matchWorksite(text: string, worksites: WorksiteRef[]): WorksiteRef | null {
  let best: WorksiteRef | null = null;
  for (const worksite of worksites) {
    if (worksite.worksite_name.length < 4) continue;
    if (!containsPhrase(text, worksite.worksite_name)) continue;
    if (!best || worksite.worksite_name.length > best.worksite_name.length) best = worksite;
  }
  return best;
}

export function commercialIsRelevant(match: EntityMatch): boolean {
  const subject =
    match.contractors.length > 0 || match.vessels.length > 0 || match.sevenFleet;
  return subject && match.australiaOrProject;
}
