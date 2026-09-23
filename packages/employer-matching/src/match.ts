import { normaliseForMerge } from "./normalise";
import { similarityRatio } from "./levenshtein";

export interface EmployerCandidate {
  employer_id: number;
  employer_name: string;
  trading_name?: string | null;
  employer_category?: string | null;
}

export interface MatchProposal {
  employer_id: number;
  name: string;
  score: number;
  is_principal: boolean;
}

export interface MatchOutcome {
  status: "auto" | "needs_review" | "unmatched";
  employerId: number | null;
  score: number | null;
  proposals: MatchProposal[];
}

/**
 * A row of any name register (employers, worksites, …) offered to
 * `proposeNameMatch`. `altNames` are scored like a trading name (the best of
 * name and alternates wins); `boost` adds PRINCIPAL_BOOST to the score, as the
 * principal-employer category does for employers; `isPrincipal` is echoed on
 * the proposal (defaults to `boost`).
 */
export interface NameCandidate {
  id: number;
  name: string;
  altNames?: (string | null | undefined)[];
  boost?: boolean;
  isPrincipal?: boolean;
}

export interface NameMatchProposal {
  id: number;
  name: string;
  score: number;
  is_principal: boolean;
}

export interface NameMatchOutcome {
  status: "auto" | "needs_review" | "unmatched";
  id: number | null;
  score: number | null;
  proposals: NameMatchProposal[];
}

const PRINCIPAL_BOOST = 0.05;
const FIRST_TOKEN_BOOST = 0.05;
const CANDIDATE_THRESHOLD = 0.65;
const AUTO_THRESHOLD = 0.92;
const AUTO_DOMINANCE_GAP = 0.05;
const TOP_N = 3;

/**
 * The one source of the matcher's thresholds (OA_UNIVERSE_ALIGNMENT_PLAN §1.8):
 * a proposal needs CANDIDATE_THRESHOLD to be listed; the top proposal is
 * accepted automatically at AUTO_THRESHOLD when it leads the runner-up by
 * AUTO_DOMINANCE_GAP; TOP_N proposals are kept.
 */
export const NAME_MATCH_THRESHOLDS = Object.freeze({
  PRINCIPAL_BOOST,
  FIRST_TOKEN_BOOST,
  CANDIDATE_THRESHOLD,
  AUTO_THRESHOLD,
  AUTO_DOMINANCE_GAP,
  TOP_N,
});

// Tokens that appear too frequently across employer names to disambiguate
// — stripping them prevents matches that share only generic words. Legal
// suffixes are already handled by normaliseForMerge upstream.
const TOKEN_STOPS = new Set([
  "australia",
  "australian",
  "aus",
  "international",
  "intl",
  "the",
  "and",
  "for",
  "of",
]);

function significantTokens(normalised: string): string[] {
  return normalised
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !TOKEN_STOPS.has(t));
}

// What proportion of the smaller token set is shared. 1.0 means the
// shorter side's tokens are all present in the longer side.
function tokenContainment(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  const matches = a.filter((t) => bSet.has(t)).length;
  if (matches === 0) return 0;
  return matches / Math.min(a.length, b.length);
}

/**
 * Score `query` against every candidate and return the top proposals with
 * the auto / needs_review / unmatched verdict. This is the matcher
 * `proposeEmployerMatch` has always been, with the trading name generalised
 * to `altNames` and the principal boost to `boost`; the scoring, the stop
 * tokens and the thresholds are unchanged, so `proposeEmployerMatch` below
 * returns exactly what it did before (pinned by the parity test in
 * apps/organising-db).
 */
export function proposeNameMatch(
  query: string,
  candidates: NameCandidate[]
): NameMatchOutcome {
  const normQuery = normaliseForMerge(query ?? "");
  const queryTokens = significantTokens(normQuery);

  if (normQuery.length === 0 || queryTokens.length === 0) {
    return { status: "unmatched", id: null, score: null, proposals: [] };
  }

  const scored: NameMatchProposal[] = [];
  for (const cand of candidates) {
    const boost = cand.boost === true;
    const isPrincipal = cand.isPrincipal ?? boost;
    const normName = normaliseForMerge(cand.name ?? "");
    const normAlts = (cand.altNames ?? [])
      .map((alt) => (alt ? normaliseForMerge(alt) : ""))
      .filter((alt) => alt.length > 0);

    const nameTokens = significantTokens(normName);
    const altTokens = normAlts.map((alt) => significantTokens(alt));

    // Hard requirement: must share at least one significant token with
    // either the legal name OR an alternate name. This eliminates pure
    // character-overlap noise (e.g. "Chevron" vs "Wheatstone").
    const shareNameToken = nameTokens.some((t) => queryTokens.includes(t));
    const shareAltToken = altTokens.some((tokens) =>
      tokens.some((t) => queryTokens.includes(t))
    );
    if (!shareNameToken && !shareAltToken) continue;

    // Token-containment scores: how thoroughly the shorter side's
    // significant tokens appear in the longer side.
    const nameTokScore = tokenContainment(queryTokens, nameTokens);
    const altTokScore = altTokens.reduce(
      (best, tokens) => Math.max(best, tokenContainment(queryTokens, tokens)),
      0
    );
    const tokenSim = Math.max(nameTokScore, altTokScore);

    // Levenshtein-on-normalised: handles minor typos within an already
    // related pair, but never elevates an unrelated pair (we already
    // gated on shared tokens).
    const nameLev =
      normName.length > 0 ? similarityRatio(normQuery, normName) : 0;
    const altLev = normAlts.reduce(
      (best, alt) => Math.max(best, similarityRatio(normQuery, alt)),
      0
    );
    const levSim = Math.max(nameLev, altLev);

    let score = Math.max(tokenSim, levSim);

    // Anchoring bonus: if the first significant token matches, the
    // pair is much more likely to be the same company.
    const qFirst = queryTokens[0];
    const eFirst =
      nameTokens[0] ?? altTokens.find((tokens) => tokens.length > 0)?.[0];
    if (qFirst && eFirst && qFirst === eFirst) {
      score = Math.min(1, score + FIRST_TOKEN_BOOST);
    }

    if (boost) {
      score = Math.min(1, score + PRINCIPAL_BOOST);
    }

    if (score >= CANDIDATE_THRESHOLD) {
      scored.push({
        id: cand.id,
        name: cand.name,
        score: Number(score.toFixed(3)),
        is_principal: isPrincipal,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const proposals = scored.slice(0, TOP_N);

  const top = proposals[0];
  if (!top) {
    return { status: "unmatched", id: null, score: null, proposals: [] };
  }

  const second = proposals[1];
  const dominant = !second || top.score - second.score >= AUTO_DOMINANCE_GAP;

  if (top.score >= AUTO_THRESHOLD && dominant) {
    return { status: "auto", id: top.id, score: top.score, proposals };
  }

  return { status: "needs_review", id: null, score: null, proposals };
}

/**
 * Employer-shaped wrapper kept for the NOPSEMA scraper and the upcoming
 * projects rematch route: same signature and byte-identical results.
 */
export function proposeEmployerMatch(
  query: string,
  employers: EmployerCandidate[]
): MatchOutcome {
  const outcome = proposeNameMatch(
    query,
    employers.map((emp) => {
      const isPrincipal = emp.employer_category === "Principal_Employer";
      return {
        id: emp.employer_id,
        name: emp.employer_name,
        altNames: [emp.trading_name],
        boost: isPrincipal,
        isPrincipal,
      };
    })
  );
  return {
    status: outcome.status,
    employerId: outcome.id,
    score: outcome.score,
    proposals: outcome.proposals.map((p) => ({
      employer_id: p.id,
      name: p.name,
      score: p.score,
      is_principal: p.is_principal,
    })),
  };
}
