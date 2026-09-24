/**
 * DA0.3 §2.6.1 item 3: `proposeEmployerMatch` must return byte-identical
 * outcomes after the refactor to `proposeNameMatch` — the NOPSEMA scraper
 * (apps/scraper/src/pipeline/match.ts) and the upcoming-projects rematch
 * route depend on it. The fixture holds the outcomes captured with the
 * pre-refactor package on 2026-09-22 for 30 queries over the production
 * employer reference list (organisation strings only).
 */
import { describe, expect, it } from "vitest";

import {
  proposeEmployerMatch,
  proposeNameMatch,
  NAME_MATCH_THRESHOLDS,
  type EmployerCandidate,
  type MatchOutcome,
} from "@oa/employer-matching";
import fixture from "./fixtures/employer-matching-parity.json";

const candidates = fixture.candidates as EmployerCandidate[];
const cases = fixture.cases as { query: string; outcome: MatchOutcome }[];

describe("proposeEmployerMatch parity (scraper / rematch route)", () => {
  it("has the 30-query corpus", () => {
    expect(cases).toHaveLength(30);
    expect(candidates.length).toBeGreaterThan(100);
  });

  it.each(cases.map((c) => [c.query, c] as const))("%j", (_query, c) => {
    expect(proposeEmployerMatch(c.query, candidates)).toEqual(c.outcome);
  });

  it("proposeNameMatch over the mapped candidates gives the same ids and scores", () => {
    const mapped = candidates.map((e) => ({
      id: e.employer_id,
      name: e.employer_name,
      altNames: [e.trading_name],
      boost: e.employer_category === "Principal_Employer",
    }));
    for (const c of cases) {
      const outcome = proposeNameMatch(c.query, mapped);
      expect(outcome.status).toBe(c.outcome.status);
      expect(outcome.id).toBe(c.outcome.employerId);
      expect(outcome.score).toBe(c.outcome.score);
      expect(outcome.proposals.map((p) => [p.id, p.score, p.is_principal])).toEqual(
        c.outcome.proposals.map((p) => [p.employer_id, p.score, p.is_principal])
      );
    }
  });

  it("exposes the plan §1.8 thresholds as the single source", () => {
    expect(NAME_MATCH_THRESHOLDS).toEqual({
      PRINCIPAL_BOOST: 0.05,
      FIRST_TOKEN_BOOST: 0.05,
      CANDIDATE_THRESHOLD: 0.65,
      AUTO_THRESHOLD: 0.92,
      AUTO_DOMINANCE_GAP: 0.05,
      TOP_N: 3,
    });
  });
});
