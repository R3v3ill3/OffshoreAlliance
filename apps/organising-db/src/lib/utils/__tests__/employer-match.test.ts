import { describe, expect, it } from "vitest";
import { matchEmployerCandidates, type EmployerLike } from "../employer-match";

const employers: EmployerLike[] = [
  { employer_id: 1, employer_name: "Monadelphous Group", trading_name: null },
  { employer_id: 2, employer_name: "UGL Pty Ltd", trading_name: "UGL Engineering" },
  { employer_id: 3, employer_name: "Compass Group Australia", trading_name: "ESS" },
  { employer_id: 4, employer_name: "Woodside Energy", trading_name: null },
];

describe("matchEmployerCandidates", () => {
  it("ranks an exact-ish name as the top high-confidence match", () => {
    const candidates = matchEmployerCandidates("Monadelphous", employers);
    expect(candidates[0]?.employer.employer_id).toBe(1);
    expect(candidates[0]?.confidence).toBe("high");
  });

  it("ignores company-suffix noise (Pty Ltd) when scoring", () => {
    const candidates = matchEmployerCandidates("UGL", employers);
    expect(candidates[0]?.employer.employer_id).toBe(2);
  });

  it("matches on trading name as well as legal name", () => {
    const candidates = matchEmployerCandidates("ESS", employers);
    expect(candidates[0]?.employer.employer_id).toBe(3);
  });

  it("returns no candidates for a value with no token overlap", () => {
    const candidates = matchEmployerCandidates("Zzxq", employers);
    expect(candidates).toHaveLength(0);
  });

  it("caps the number of candidates returned", () => {
    const candidates = matchEmployerCandidates("Group", employers, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
  });
});
