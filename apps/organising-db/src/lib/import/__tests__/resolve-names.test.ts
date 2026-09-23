/**
 * DA0.3 §2.6.1 item 2: the resolution order and the "never create" invariant
 * of `resolveNames`. Organisation strings only; the small reference set below
 * is synthetic.
 */
import { describe, expect, it } from "vitest";

import { NAME_MATCH_THRESHOLDS } from "@oa/employer-matching";
import { foldName } from "../name-fold";
import { resolveNames, type ReferenceRow, type ReferenceSet } from "../resolve-names";

function row(id: number, name: string, extra: Partial<ReferenceRow> = {}): ReferenceRow {
  return { id, name, altNames: [], boost: false, isActive: true, ...extra };
}

const ref: ReferenceSet = {
  rows: [
    row(1, "Woodside Energy Ltd", { altNames: ["Woodside"] }),
    row(2, "Chevron Australia", { boost: true }),
    row(3, "Monadelphous"),
    row(4, "Old Contractor", { isActive: false }),
    row(5, "Sea1 Offshore"),
    row(6, "Siem Offshore"),
    row(7, "Unemployed"),
    row(8, "Alpha Marine Services"),
    row(9, "Alpha Marine Logistics"),
  ],
  aliases: [
    { id: 1, aliasName: "WEL" },
    { id: 2, aliasName: "Chevron" },
    { id: 5, aliasName: "SO" },
    { id: 6, aliasName: "SO" },
    { id: 999, aliasName: "orphan alias" },
  ],
  rejected: [{ normalisedName: "unemployed" }],
};

const ids = new Set(ref.rows.map((r) => r.id));

function one(raw: string, set: ReferenceSet = ref) {
  const out = resolveNames("employer", [raw], set);
  expect(out).toHaveLength(1);
  return out[0];
}

describe("resolveNames — order", () => {
  it("rejected memory beats exact", () => {
    const o = one("Unemployed");
    expect(o.status).toBe("rejected");
    expect(o.resolvedId).toBeNull();
    expect(o.proposals).toEqual([]);
  });

  it("exact beats alias beats fuzzy", () => {
    expect(one("Woodside Energy Ltd")).toMatchObject({ status: "exact", resolvedId: 1, method: "exact", resolvedName: "Woodside Energy Ltd" });
    expect(one("WEL")).toMatchObject({ status: "alias", resolvedId: 1, method: "alias", proposals: [] });
    expect(one("Monadelphous Engineering Pty Ltd")).toMatchObject({ status: "auto", resolvedId: 3, method: "fuzzy" });
  });

  it("case / space variants of a canonical name are exact, never auto (no alias written)", () => {
    for (const raw of ["WOODSIDE ENERGY LTD", "  woodside   energy ltd ", "Woodside\tEnergy Ltd"]) {
      const o = one(raw);
      expect(o.status).toBe("exact");
      expect(o.writesAlias).toBe(false);
      expect(o.resolvedId).toBe(1);
    }
  });

  it("a trading name is an exact hit", () => {
    expect(one("woodside")).toMatchObject({ status: "exact", resolvedId: 1 });
  });

  it("an alias hit carries no proposals and no score", () => {
    expect(one("chevron")).toMatchObject({ status: "alias", resolvedId: 2, score: null, proposals: [] });
  });

  it("a dominant fuzzy match at >= 0.92 is auto with writesAlias", () => {
    const o = one("Monadelphous Engineering");
    expect(o.status).toBe("auto");
    expect(o.score).toBeGreaterThanOrEqual(NAME_MATCH_THRESHOLDS.AUTO_THRESHOLD);
    expect(o.writesAlias).toBe(true);
    expect(o.resolvedId).toBe(3);
    expect(o.proposals[0]).toMatchObject({ id: 3, name: "Monadelphous" });
  });

  it("two proposals within the 0.05 gap go to review", () => {
    const o = one("Alpha Marine");
    expect(o.status).toBe("needs_review");
    expect(o.resolvedId).toBeNull();
    expect(o.proposals.map((p) => p.id).sort()).toEqual([8, 9]);
    expect(Math.abs(o.proposals[0].score - o.proposals[1].score)).toBeLessThan(NAME_MATCH_THRESHOLDS.AUTO_DOMINANCE_GAP);
  });

  it("nothing at >= 0.65 is unmatched", () => {
    const o = one("Zebra Quarry Holdings");
    expect(o.status).toBe("unmatched");
    expect(o.proposals).toEqual([]);
    expect(o.resolvedId).toBeNull();
  });

  it("proposals are at most TOP_N and sorted best first", () => {
    const many: ReferenceSet = {
      rows: [1, 2, 3, 4, 5].map((i) => row(i, `Alpha Marine Group ${"X".repeat(i)}`)),
      aliases: [],
      rejected: [],
    };
    const o = one("Alpha Marine Group", many);
    expect(o.proposals.length).toBeLessThanOrEqual(NAME_MATCH_THRESHOLDS.TOP_N);
    for (let i = 1; i < o.proposals.length; i++) {
      expect(o.proposals[i - 1].score).toBeGreaterThanOrEqual(o.proposals[i].score);
    }
  });

  it("duplicate strings collapse on the fold, keeping the first raw string and counting occurrences", () => {
    const out = resolveNames("employer", ["Woodside Energy Ltd", "WOODSIDE ENERGY LTD", " woodside  energy ltd "], ref);
    expect(out).toHaveLength(1);
    expect(out[0].rawName).toBe("Woodside Energy Ltd");
    expect(out[0].occurrences).toBe(3);
  });

  it("ignores empty and non-string input", () => {
    expect(resolveNames("employer", ["", "  ", null, undefined], ref)).toEqual([]);
  });

  it("inactive rows are exact targets but not fuzzy candidates", () => {
    expect(one("old contractor")).toMatchObject({ status: "exact", resolvedId: 4 });
    expect(one("Old Contractor Services").status).toBe("unmatched");
  });

  it("an alias on two rows is the ambiguity case: review with both rows", () => {
    const o = one("so");
    expect(o.status).toBe("needs_review");
    expect(o.proposals.map((p) => p.id)).toEqual([5, 6]);
    expect(o.resolvedId).toBeNull();
  });

  it("a fold collision between two rows (shared trading name) goes to review with both", () => {
    const set: ReferenceSet = {
      rows: [row(1, "Alpha Holdings", { altNames: ["Alpha"] }), row(2, "Alpha Services", { altNames: ["ALPHA"] })],
      aliases: [],
      rejected: [],
    };
    const o = one("alpha", set);
    expect(o.status).toBe("needs_review");
    expect(o.proposals.map((p) => p.id)).toEqual([1, 2]);
  });

  it("a saved alias also scores in the fuzzy step (close-but-not-exact alias)", () => {
    const set: ReferenceSet = {
      rows: [row(1, "Programmed Offshore")],
      aliases: [{ id: 1, aliasName: "Rigforce Contracting" }],
      rejected: [],
    };
    const o = one("Rigforce Contracting Pty Ltd", set);
    expect(o.status).toBe("auto");
    expect(o.resolvedId).toBe(1);
  });

  it("an alias of a row outside the set is never a target", () => {
    expect(one("orphan alias").status).toBe("unmatched");
  });
});

describe("resolveNames — thresholds (single source: NAME_MATCH_THRESHOLDS)", () => {
  // Containment = shared / min(query tokens, candidate tokens). With 20 tokens
  // on both sides and no shared first token, 13 shared = 0.65 exactly and
  // 12 shared = 0.60; the scorer cannot produce 0.649, so the boundary is
  // pinned on the values it can produce.
  const tokens = Array.from({ length: 20 }, (_, i) => `tok${String(i).padStart(2, "0")}`);
  const candidate = row(1, tokens.join(" "));
  const set: ReferenceSet = { rows: [candidate], aliases: [], rejected: [] };
  // The disjoint tokens are long so the Levenshtein ratio stays well below
  // the containment score and cannot lift it.
  const query = (shared: number) =>
    [...Array.from({ length: 20 - shared }, (_, i) => `zzzzzzzzzzzz${String(i).padStart(2, "0")}`), ...tokens.slice(1, 1 + shared)].join(" ");

  it("0.65 is a candidate (needs_review); 0.60 is unmatched", () => {
    expect(NAME_MATCH_THRESHOLDS.CANDIDATE_THRESHOLD).toBe(0.65);
    const at = one(query(13), set);
    expect(at.status).toBe("needs_review");
    expect(at.proposals[0].score).toBe(0.65);
    expect(one(query(12), set).status).toBe("unmatched");
  });

  it("0.92 with no runner-up is auto; 0.90 is needs_review", () => {
    expect(NAME_MATCH_THRESHOLDS.AUTO_THRESHOLD).toBe(0.92);
    const tokens25 = Array.from({ length: 25 }, (_, i) => `tok${String(i).padStart(2, "0")}`);
    const set25: ReferenceSet = { rows: [row(1, tokens25.join(" "))], aliases: [], rejected: [] };
    const q = (shared: number) =>
      [...Array.from({ length: 25 - shared }, (_, i) => `zzzzzzzzzzzz${String(i).padStart(2, "0")}`), ...tokens25.slice(1, 1 + shared)].join(" ");
    const auto = one(q(23), set25);
    expect(auto.status).toBe("auto");
    expect(auto.score).toBe(0.92);
    const review = one(q(22), set25);
    expect(review.status).toBe("needs_review");
    expect(review.proposals[0].score).toBe(0.88);
  });
});

describe("resolveNames — never create (property over a generated corpus)", () => {
  it("every resolvedId and every proposal id is a row of the reference set", () => {
    const words = ["alpha", "marine", "offshore", "energy", "woodside", "chevron", "services", "group", "pty", "ltd", "sea1", "siem", "old", "contractor", "unemployed", "wel", "so"];
    let seed = 20260922;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const corpus: string[] = [];
    for (let i = 0; i < 400; i++) {
      const n = 1 + Math.floor(rand() * 4);
      const parts: string[] = [];
      for (let j = 0; j < n; j++) {
        const w = words[Math.floor(rand() * words.length)];
        parts.push(rand() < 0.3 ? w.toUpperCase() : rand() < 0.5 ? w[0].toUpperCase() + w.slice(1) : w);
      }
      corpus.push(parts.join(rand() < 0.2 ? "  " : " ") + (rand() < 0.1 ? "\t" : ""));
    }
    const out = resolveNames("employer", corpus, ref);
    expect(out.length).toBeGreaterThan(0);
    for (const o of out) {
      expect(o.normalisedName).toBe(foldName(o.rawName));
      if (o.resolvedId != null) {
        expect(ids.has(o.resolvedId)).toBe(true);
        expect(["exact", "alias", "auto"]).toContain(o.status);
        expect(o.resolvedName).toBe(ref.rows.find((r) => r.id === o.resolvedId)!.name);
      } else {
        expect(["needs_review", "unmatched", "rejected"]).toContain(o.status);
      }
      for (const p of o.proposals) expect(ids.has(p.id)).toBe(true);
      if (o.status !== "auto") expect(o.writesAlias).toBe(false);
    }
  });
});

describe("resolveNames — performance (risk R4)", () => {
  it("resolves 500 distinct names against 200 candidates in under 2 s", () => {
    const words = ["north", "west", "shelf", "marine", "offshore", "energy", "services", "contracting", "subsea", "logistics", "crew", "vessel", "gas", "plant", "engineering", "solutions", "group", "australia", "pacific", "coastal"];
    const rows: ReferenceRow[] = Array.from({ length: 200 }, (_, i) =>
      row(i + 1, `${words[i % 20]} ${words[(i * 7) % 20]} ${words[(i * 3 + 1) % 20]} ${i}`)
    );
    const set: ReferenceSet = { rows, aliases: [], rejected: [] };
    const names = Array.from({ length: 500 }, (_, i) => `${words[(i * 11) % 20]} ${words[(i * 5 + 2) % 20]} ${words[(i * 13 + 3) % 20]} variant ${i}`);
    const started = performance.now();
    const out = resolveNames("employer", names, set);
    const elapsed = performance.now() - started;
    expect(out).toHaveLength(500);
    expect(elapsed).toBeLessThan(2000);
  });
});
