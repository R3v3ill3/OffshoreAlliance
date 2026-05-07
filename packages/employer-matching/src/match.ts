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

const PRINCIPAL_BOOST = 0.05;
const FIRST_TOKEN_BOOST = 0.05;
const CANDIDATE_THRESHOLD = 0.65;
const AUTO_THRESHOLD = 0.92;
const AUTO_DOMINANCE_GAP = 0.05;
const TOP_N = 3;

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

export function proposeEmployerMatch(
  query: string,
  employers: EmployerCandidate[]
): MatchOutcome {
  const normQuery = normaliseForMerge(query ?? "");
  const queryTokens = significantTokens(normQuery);

  if (normQuery.length === 0 || queryTokens.length === 0) {
    return { status: "unmatched", employerId: null, score: null, proposals: [] };
  }

  const scored: MatchProposal[] = [];
  for (const emp of employers) {
    const isPrincipal = emp.employer_category === "Principal_Employer";
    const normName = normaliseForMerge(emp.employer_name ?? "");
    const normTrading = emp.trading_name
      ? normaliseForMerge(emp.trading_name)
      : "";

    const nameTokens = significantTokens(normName);
    const tradingTokens = normTrading ? significantTokens(normTrading) : [];

    // Hard requirement: must share at least one significant token with
    // either the legal name OR the trading name. This eliminates pure
    // character-overlap noise (e.g. "Chevron" vs "Wheatstone").
    const shareNameToken = nameTokens.some((t) => queryTokens.includes(t));
    const shareTradingToken = tradingTokens.some((t) =>
      queryTokens.includes(t)
    );
    if (!shareNameToken && !shareTradingToken) continue;

    // Token-containment scores: how thoroughly the shorter side's
    // significant tokens appear in the longer side.
    const nameTokScore = tokenContainment(queryTokens, nameTokens);
    const tradingTokScore = tokenContainment(queryTokens, tradingTokens);
    const tokenSim = Math.max(nameTokScore, tradingTokScore);

    // Levenshtein-on-normalised: handles minor typos within an already
    // related pair, but never elevates an unrelated pair (we already
    // gated on shared tokens).
    const nameLev =
      normName.length > 0 ? similarityRatio(normQuery, normName) : 0;
    const tradingLev =
      normTrading.length > 0 ? similarityRatio(normQuery, normTrading) : 0;
    const levSim = Math.max(nameLev, tradingLev);

    let score = Math.max(tokenSim, levSim);

    // Anchoring bonus: if the first significant token matches, the
    // pair is much more likely to be the same company.
    const qFirst = queryTokens[0];
    const eFirst = nameTokens[0] ?? tradingTokens[0];
    if (qFirst && eFirst && qFirst === eFirst) {
      score = Math.min(1, score + FIRST_TOKEN_BOOST);
    }

    if (isPrincipal) {
      score = Math.min(1, score + PRINCIPAL_BOOST);
    }

    if (score >= CANDIDATE_THRESHOLD) {
      scored.push({
        employer_id: emp.employer_id,
        name: emp.employer_name,
        score: Number(score.toFixed(3)),
        is_principal: isPrincipal,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const proposals = scored.slice(0, TOP_N);

  const top = proposals[0];
  if (!top) {
    return { status: "unmatched", employerId: null, score: null, proposals: [] };
  }

  const second = proposals[1];
  const dominant = !second || top.score - second.score >= AUTO_DOMINANCE_GAP;

  if (top.score >= AUTO_THRESHOLD && dominant) {
    return {
      status: "auto",
      employerId: top.employer_id,
      score: top.score,
      proposals,
    };
  }

  return {
    status: "needs_review",
    employerId: null,
    score: null,
    proposals,
  };
}
