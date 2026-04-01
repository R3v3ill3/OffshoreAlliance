/**
 * Fuzzy matching and categorisation for occupation / job-title strings.
 *
 * Uses a hybrid Jaccard + normalised-Levenshtein approach against a
 * canonical occupations table and its aliases, similar to the worksite
 * and employer fuzzy matchers used elsewhere in the codebase.
 */

import { levenshtein } from "@/lib/utils/employer-merge-helpers";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Occupation {
  occupation_id: number;
  canonical_name: string;
  category: string | null;
}

export interface OccupationAlias {
  occupation_id: number;
  alias_name: string;
}

export type OccupationConfidence = "high" | "medium" | "low";

export interface OccupationCandidate {
  occupation: Occupation;
  matchedVia: string; // canonical_name or the alias that matched
  score: number;
  confidence: OccupationConfidence;
}

// ─── Category detection ─────────────────────────────────────────────────────

const CATEGORY_RULES: { patterns: RegExp[]; category: string }[] = [
  {
    patterns: [
      /\brigger\b/i,
      /\bscaffold/i,
      /\bboilermaker\b/i,
      /\bfitter\b/i,
      /\belectrician\b/i,
      /\bpainter\b/i,
      /\bblaster\b/i,
      /\bwelder\b/i,
      /\bplumber\b/i,
      /\bcarpenter\b/i,
      /\binsulator\b/i,
      /\bsheet\s*metal/i,
      /\btrade\s*assist/i,
      /\bmechanic\b/i,
      /\bmechanical\s*fitter\b/i,
      /\binstrument/i,
    ],
    category: "Trades",
  },
  {
    patterns: [
      /\binspect/i,
      /\bndt\b/i,
      /\baicip\b/i,
      /\bcorrosion/i,
      /\bcoating/i,
    ],
    category: "Inspection",
  },
  {
    patterns: [
      /\boperator\b/i,
      /\bprocess\b/i,
      /\bproduction\b/i,
      /\bplant\s*op/i,
      /\bpipeline\s*controller/i,
      /\bgas\s*system/i,
    ],
    category: "Operations",
  },
  {
    patterns: [
      /\bcrane\b/i,
      /\blifting\b/i,
      /\bdogman\b/i,
    ],
    category: "Lifting",
  },
  {
    patterns: [
      /\brope\s*access/i,
    ],
    category: "Rope_Access",
  },
  {
    patterns: [
      /\bmarine\b/i,
      /\bseaman\b/i,
      /\bdeck\b/i,
      /\bmaster\b/i,
      /\bbosun\b/i,
      /\bmate\b/i,
      /\bcoxswain\b/i,
      /\blinesman\b/i,
      /\bAB\b/,
      /\bIntegrated\s*Rating/i,
    ],
    category: "Marine",
  },
  {
    patterns: [
      /\bcook\b/i,
      /\bcater/i,
      /\bchef\b/i,
      /\bsteward/i,
      /\blaundry/i,
      /\bcamp\s*attend/i,
    ],
    category: "Catering",
  },
  {
    patterns: [
      /\bpilot\b/i,
      /\baviation\b/i,
      /\bhelicopter/i,
      /\bengine\s*engineer/i,
    ],
    category: "Aviation",
  },
  {
    patterns: [
      /\bengineer\b/i,
      /\btechni/i,
      /\bchemist\b/i,
      /\bscientist\b/i,
      /\banalyst\b/i,
    ],
    category: "Engineering",
  },
  {
    patterns: [
      /\bsupervisor\b/i,
      /\bsuperintendent\b/i,
      /\bmanager\b/i,
      /\bforeman\b/i,
      /\bcoordinator\b/i,
      /\bleading\s*hand\b/i,
    ],
    category: "Management",
  },
  {
    patterns: [
      /\badmin/i,
      /\bclerk\b/i,
      /\blogist/i,
      /\bstore/i,
      /\bwarehou/i,
      /\bmaterial/i,
    ],
    category: "Administration",
  },
];

export function detectOccupationCategory(name: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(name))) {
      return rule.category;
    }
  }
  return null;
}

// ─── Normalisation ──────────────────────────────────────────────────────────

const QUALIFIER_PREFIXES = /^(leading\s*hand|senior|chief|head|junior|trainee|apprentice|casual)\b[\s\-]*/i;

export function normaliseOccupation(name: string): string {
  return name
    .toLowerCase()
    .replace(QUALIFIER_PREFIXES, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function tokenSet(s: string): Set<string> {
  const stopWords = new Set(["the", "and", "of", "for", "in", "at", "by", "a", "an", "to"]);
  return new Set(
    s.split(" ").filter((w) => w.length >= 2 && !stopWords.has(w))
  );
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function normLevenshteinScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function combinedScore(query: string, candidate: string): number {
  const normQ = normaliseOccupation(query);
  const normC = normaliseOccupation(candidate);

  const jaccard = jaccardScore(tokenSet(normQ), tokenSet(normC));
  const lev = normLevenshteinScore(normQ, normC);

  // Weight: 40% Jaccard (token overlap), 60% Levenshtein (spelling similarity)
  return jaccard * 0.4 + lev * 0.6;
}

function scoreToConfidence(score: number): OccupationConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function matchOccupationCandidates(
  rawName: string,
  occupations: Occupation[],
  aliases: OccupationAlias[],
  topN = 3
): OccupationCandidate[] {
  const aliasesByOccId = new Map<number, string[]>();
  for (const a of aliases) {
    if (!aliasesByOccId.has(a.occupation_id)) {
      aliasesByOccId.set(a.occupation_id, []);
    }
    aliasesByOccId.get(a.occupation_id)!.push(a.alias_name);
  }

  const scored: OccupationCandidate[] = [];

  for (const occ of occupations) {
    let bestScore = combinedScore(rawName, occ.canonical_name);
    let matchedVia = occ.canonical_name;

    const occAliases = aliasesByOccId.get(occ.occupation_id) ?? [];
    for (const alias of occAliases) {
      const aliasScore = combinedScore(rawName, alias);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        matchedVia = alias;
      }
    }

    if (bestScore > 0.3) {
      scored.push({
        occupation: occ,
        matchedVia,
        score: bestScore,
        confidence: scoreToConfidence(bestScore),
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

/**
 * Group a flat list of raw occupation strings into clusters of likely
 * duplicates. Used in the wizard to let the user pick one canonical
 * name per cluster.
 */
export function clusterOccupations(
  rawNames: string[],
  threshold = 0.75
): string[][] {
  const used = new Set<number>();
  const clusters: string[][] = [];

  for (let i = 0; i < rawNames.length; i++) {
    if (used.has(i)) continue;
    const cluster = [rawNames[i]];
    used.add(i);

    for (let j = i + 1; j < rawNames.length; j++) {
      if (used.has(j)) continue;
      const score = combinedScore(rawNames[i], rawNames[j]);
      if (score >= threshold) {
        cluster.push(rawNames[j]);
        used.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}
