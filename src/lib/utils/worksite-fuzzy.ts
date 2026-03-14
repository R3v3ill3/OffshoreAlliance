import type { Worksite } from "@/types/database";
import type { WizardConfidence } from "@/types/database";

export interface WorksiteCandidate {
  worksite: Worksite;
  score: number;
  confidence: WizardConfidence;
}

// Known abbreviation expansions for offshore industry terms
const ABBREVIATION_MAP: Record<string, string> = {
  NRC: "north rankin complex north west shelf",
  NWS: "north west shelf",
  GWA: "gorgon wheatstone angel",
  FLNG: "floating lng",
  FPSO: "floating production storage offloading",
  LNG: "liquefied natural gas",
  CPF: "central processing facility",
  SCA: "scarborough angel",
  MBR: "macedon barrow",
  DBNGP: "dampier to bunbury natural gas pipeline",
  MPT: "maitland",
};

function expandAbbreviations(input: string): string {
  const words = input.trim().toUpperCase().split(/[\s\/\-]+/);
  return words
    .map((w) => {
      const expansion = ABBREVIATION_MAP[w];
      return expansion ? `${expansion} ${w}` : w;
    })
    .join(" ");
}

function normalise(input: string): string {
  return expandAbbreviations(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  const stopWords = new Set(["the", "and", "of", "for", "in", "at", "by", "a", "an", "to"]);
  return new Set(
    s
      .split(" ")
      .filter((w) => w.length >= 2 && !stopWords.has(w))
  );
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

// Additionally check for partial containment (substring match on key tokens)
function partialContainmentBonus(queryTokens: Set<string>, candidateTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0;
  const matches = [...queryTokens].filter((t) => {
    // Check if any candidate token starts with or contains this query token
    return [...candidateTokens].some(
      (ct) => ct.startsWith(t) || t.startsWith(ct)
    );
  });
  return matches.length / queryTokens.size * 0.3;
}

function scoreToConfidence(score: number): WizardConfidence {
  if (score >= 0.35) return "high";
  if (score >= 0.15) return "medium";
  return "low";
}

/**
 * Fuzzy-matches a group name from an import spreadsheet against the list
 * of worksites in the database. Returns up to `topN` candidates ordered
 * by descending score.
 */
export function matchWorksiteCandidates(
  groupName: string,
  worksites: Worksite[],
  topN = 3
): WorksiteCandidate[] {
  const normQuery = normalise(groupName);
  const queryTokens = tokenSet(normQuery);

  const scored = worksites.map((ws) => {
    const normCandidate = normalise(ws.worksite_name);
    const candidateTokens = tokenSet(normCandidate);

    const base = jaccardScore(queryTokens, candidateTokens);
    const bonus = partialContainmentBonus(queryTokens, candidateTokens);
    const score = Math.min(1, base + bonus);

    return { worksite: ws, score, confidence: scoreToConfidence(score) };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
