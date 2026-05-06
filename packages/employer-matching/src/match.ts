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
const CANDIDATE_THRESHOLD = 0.65;
const AUTO_THRESHOLD = 0.92;
const AUTO_DOMINANCE_GAP = 0.05;
const TOP_N = 3;

export function proposeEmployerMatch(
  query: string,
  employers: EmployerCandidate[]
): MatchOutcome {
  const normQuery = normaliseForMerge(query ?? "");
  if (normQuery.length === 0) {
    return { status: "unmatched", employerId: null, score: null, proposals: [] };
  }

  const scored: MatchProposal[] = [];
  for (const emp of employers) {
    const isPrincipal = emp.employer_category === "Principal_Employer";
    const normName = normaliseForMerge(emp.employer_name ?? "");
    const normTrading = emp.trading_name
      ? normaliseForMerge(emp.trading_name)
      : "";

    const nameScore = normName.length > 0 ? similarityRatio(normQuery, normName) : 0;
    const tradingScore =
      normTrading.length > 0 ? similarityRatio(normQuery, normTrading) : 0;

    const rawScore = Math.max(nameScore, tradingScore);
    const adjScore = isPrincipal
      ? Math.min(1, rawScore + PRINCIPAL_BOOST)
      : rawScore;

    if (adjScore >= CANDIDATE_THRESHOLD) {
      scored.push({
        employer_id: emp.employer_id,
        name: emp.employer_name,
        score: Number(adjScore.toFixed(3)),
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
