/**
 * Generic fuzzy clustering for deduplicating import data.
 *
 * Groups near-duplicate strings into clusters, picks a canonical
 * name for each cluster, and tracks all spelling variants as
 * pending aliases.
 */

import { levenshtein } from "@/lib/utils/employer-merge-helpers";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Cluster {
  id: number;
  canonicalName: string;
  variants: string[];
  occurrenceCount: number;
  suggestedCategory?: string | null;
  confirmed: boolean;
}

// ─── Normalisation helpers ──────────────────────────────────────────────────

const KNOWN_ACRONYMS = new Set([
  "NDT", "AICIP", "API", "FPSO", "FPU", "FLNG", "LNG", "CPF", "NWS",
  "DBNGP", "GWA", "ROV", "HSE", "QA", "QC", "DPO", "DP", "ETO",
  "LAME", "E&I", "BMO", "FMO", "CSU", "ABS", "AB", "AGIG", "BW",
  "TE", "SMW",
]);

function isUpperCase(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

function isTitleCase(s: string): boolean {
  return /^[A-Z][a-z]/.test(s);
}

/**
 * Score a variant for suitability as canonical name.
 * Higher = better candidate.
 */
function casingScore(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;

  // Penalise ALL CAPS heavily
  if (isUpperCase(trimmed) && trimmed.length > 5) return 1;
  // Penalise all lowercase
  if (trimmed === trimmed.toLowerCase()) return 2;
  // Prefer Title Case or mixed case with acronyms
  if (isTitleCase(trimmed)) return 4;
  // Mixed case (e.g. "NDT Technician") is fine
  return 3;
}

/**
 * Pick the best canonical name from a cluster of variants.
 * Prefers: highest occurrence count, then best casing quality.
 */
export function pickCanonicalName(
  variants: string[],
  occurrenceCounts: Map<string, number>
): string {
  if (variants.length === 0) return "";
  if (variants.length === 1) return variants[0];

  return [...variants].sort((a, b) => {
    const countA = occurrenceCounts.get(a) ?? 0;
    const countB = occurrenceCounts.get(b) ?? 0;
    if (countB !== countA) return countB - countA;
    const caseA = casingScore(a);
    const caseB = casingScore(b);
    if (caseB !== caseA) return caseB - caseA;
    return a.length - b.length;
  })[0];
}

// ─── Clustering ─────────────────────────────────────────────────────────────

function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Cluster a list of raw strings by fuzzy similarity.
 *
 * 1. First groups exact-normalised matches (cheap pass).
 * 2. Then merges remaining groups whose representatives are
 *    similar above `threshold`.
 */
export function clusterByFuzzy(
  items: string[],
  normFn: (s: string) => string,
  threshold: number,
  occurrenceCounts: Map<string, number>,
  categoryFn?: (s: string) => string | null
): Cluster[] {
  // Pass 1: exact normalisation grouping
  const normGroups = new Map<string, string[]>();
  for (const item of items) {
    const norm = normFn(item);
    if (!normGroups.has(norm)) normGroups.set(norm, []);
    normGroups.get(norm)!.push(item);
  }

  // Pass 2: fuzzy merge of normalised representatives
  const reps = [...normGroups.keys()];
  const used = new Set<number>();
  const mergedGroups: string[][] = [];

  for (let i = 0; i < reps.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const cluster = [...normGroups.get(reps[i])!];

    for (let j = i + 1; j < reps.length; j++) {
      if (used.has(j)) continue;
      if (similarityRatio(reps[i], reps[j]) >= threshold) {
        used.add(j);
        cluster.push(...normGroups.get(reps[j])!);
      }
    }

    mergedGroups.push(cluster);
  }

  // Build Cluster objects
  return mergedGroups.map((variants, idx) => {
    const dedupedVariants = [...new Set(variants)];
    const canonical = pickCanonicalName(dedupedVariants, occurrenceCounts);
    const totalOccurrences = dedupedVariants.reduce(
      (sum, v) => sum + (occurrenceCounts.get(v) ?? 0),
      0
    );
    const category = categoryFn ? categoryFn(canonical) : null;

    return {
      id: idx,
      canonicalName: canonical,
      variants: dedupedVariants.sort(),
      occurrenceCount: totalOccurrences,
      suggestedCategory: category,
      confirmed: false,
    };
  });
}

/**
 * Generic normalisation: lowercase, strip punctuation, collapse whitespace.
 */
export function normaliseGeneric(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Employer-specific normalisation: also strips Pty Ltd etc.
 */
export function normaliseEmployer(s: string): string {
  return s
    .toLowerCase()
    .replace(
      /\b(pty\.?\s*ltd\.?|ltd\.?|pty\.?|inc\.?|corp\.?|llc\.?|llp\.?)\b/gi,
      ""
    )
    .replace(
      /\b(australia|australian|aus|international|intl|services|service|group|holdings|solutions)\b/gi,
      ""
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
