import type { WizardConfidence } from "@/types/database";

export interface EmployerLike {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
}

export interface EmployerCandidate {
  employer: EmployerLike;
  score: number;
  confidence: WizardConfidence;
}

// Common company-suffix noise that should not drive a match.
const COMPANY_STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "for",
  "a",
  "an",
  "pty",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "co",
  "company",
  "group",
  "holdings",
  "australia",
  "aust",
  "services",
]);

function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalise(s)
      .split(" ")
      .filter((w) => w.length >= 2 && !COMPANY_STOP_WORDS.has(w))
  );
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// Partial containment bonus (substring match on key tokens), mirroring the
// worksite matcher so abbreviations / prefixes still score.
function partialContainmentBonus(
  queryTokens: Set<string>,
  candidateTokens: Set<string>
): number {
  if (queryTokens.size === 0) return 0;
  const matches = [...queryTokens].filter((t) =>
    [...candidateTokens].some((ct) => ct.startsWith(t) || t.startsWith(ct))
  );
  return (matches.length / queryTokens.size) * 0.3;
}

function scoreToConfidence(score: number): WizardConfidence {
  if (score >= 0.35) return "high";
  if (score >= 0.15) return "medium";
  return "low";
}

function scoreCandidate(queryTokens: Set<string>, candidateName: string): number {
  const candidateTokens = tokenSet(candidateName);
  const base = jaccardScore(queryTokens, candidateTokens);
  const bonus = partialContainmentBonus(queryTokens, candidateTokens);
  return Math.min(1, base + bonus);
}

/**
 * Fuzzy-matches an employer name from an import spreadsheet against the list of
 * employers in the database. Each employer's trading name is also scored and
 * the best match wins. Returns up to `topN` candidates ordered by descending
 * score. Mirrors `matchWorksiteCandidates` so the import wizard can offer
 * employer matching with the same UX as worksite matching.
 */
export function matchEmployerCandidates(
  rawValue: string,
  employers: EmployerLike[],
  topN = 5
): EmployerCandidate[] {
  const queryTokens = tokenSet(rawValue);

  const scored = employers.map((employer) => {
    let bestScore = scoreCandidate(queryTokens, employer.employer_name);
    if (employer.trading_name) {
      const tradingScore = scoreCandidate(queryTokens, employer.trading_name);
      if (tradingScore > bestScore) bestScore = tradingScore;
    }
    return {
      employer,
      score: bestScore,
      confidence: scoreToConfidence(bestScore),
    };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
