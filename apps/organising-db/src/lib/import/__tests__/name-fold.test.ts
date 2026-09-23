import { describe, expect, it } from "vitest";

import { foldName } from "../name-fold";
import { FOLD_PARITY_CASES } from "./fixtures/fold-parity";

describe("foldName (DA0.3 §2.3.2)", () => {
  it("has the 12 parity strings", () => {
    expect(FOLD_PARITY_CASES).toHaveLength(12);
  });

  it.each(FOLD_PARITY_CASES)("folds %j", ({ input, folded }) => {
    expect(foldName(input)).toBe(folded);
  });

  it("is idempotent", () => {
    for (const { folded } of FOLD_PARITY_CASES) expect(foldName(folded)).toBe(folded);
  });

  it("keeps legal suffixes (exact means exact after folding)", () => {
    expect(foldName("Acme Pty Ltd")).not.toBe(foldName("Acme"));
  });

  it("folds an all-whitespace string to the empty string", () => {
    expect(foldName(" \t\n ")).toBe("");
  });
});
