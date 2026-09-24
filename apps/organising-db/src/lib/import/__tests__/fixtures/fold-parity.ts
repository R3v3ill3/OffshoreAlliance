/**
 * The 12-string parity list for `foldName()` (TypeScript) and `fold_name()`
 * (SQL): case, tabs, double spaces, trailing space, a newline, a legal
 * suffix (kept), and the membership system's "Employer : Employer: Site"
 * colon shape (lib/import/membership-row-builder.ts). Organisation strings
 * only. Used by __tests__/name-fold.test.ts (in process) and by
 * __contract__/name-match-reviews.contract.test.ts (against the database).
 */
export const FOLD_PARITY_CASES: readonly { input: string; folded: string }[] = [
  { input: "Woodside Energy", folded: "woodside energy" },
  { input: "WOODSIDE ENERGY", folded: "woodside energy" },
  { input: "  Woodside Energy  ", folded: "woodside energy" },
  { input: "Woodside\tEnergy", folded: "woodside energy" },
  { input: "Woodside  Energy   Ltd", folded: "woodside energy ltd" },
  { input: "Woodside Energy Pty Ltd", folded: "woodside energy pty ltd" },
  { input: "Employer : Employer: Site", folded: "employer : employer: site" },
  { input: "MER Solutions: Port Hedland", folded: "mer solutions: port hedland" },
  { input: "Floatel triumph\n", folded: "floatel triumph" },
  { input: "\tKGP", folded: "kgp" },
  { input: "Wheatstone LNG (Downstream)", folded: "wheatstone lng (downstream)" },
  { input: "A.T.C.  Offshore ", folded: "a.t.c. offshore" },
];
