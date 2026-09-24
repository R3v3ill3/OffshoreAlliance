/**
 * DA0.3 §2.6.1 item 5 / §3.4: the replay harness. Loads the production
 * reference lists (organisation strings only), the variants and the
 * expectations the builder wrote, runs the single resolution path over every
 * string of the replay file, and asserts:
 *
 *   - no outcome resolves to a row outside the reference set ("never create"),
 *   - the counts equal fixtures/expected.json (the numbers plan §4 A3 / A6 quote),
 *   - after the decisions the fixture prescribes (each queued variant → its
 *     canonical, as an alias) a second pass queues nothing but the
 *     reference's own fold collisions (DA1.1's duplicates), and 0 variants.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildEntityFixture,
  buildRows,
  computeExpectation,
  referenceSetFromEmployers,
  referenceSetFromWorksites,
  type EntityExpectation,
  type ReferenceEmployersFile,
  type ReferenceWorksitesFile,
  type VariantsFile,
} from "../../../../../../scripts/data-hygiene/da0.3/fixture-lib";
import { foldName } from "../name-fold";
import { resolveNames } from "../resolve-names";

const fixtures = resolve(__dirname, "../../../../../../scripts/data-hygiene/da0.3/fixtures");
const readJson = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtures, name), "utf8")) as T;

const employersFile = readJson<ReferenceEmployersFile>("reference_employers.json");
const worksitesFile = readJson<ReferenceWorksitesFile>("reference_worksites.json");
const variants = readJson<VariantsFile>("variants.json");
const expected = readJson<{
  file: { rows: number; distinctEmployerStrings: number; distinctWorksiteStrings: number };
  employers: EntityExpectation;
  worksites: EntityExpectation;
  queuedTotal: number;
  createdEmployers: number;
  createdWorksites: number;
  secondPassQueuedFromVariants: number;
}>("expected.json");

const employers = buildEntityFixture(
  "employer",
  referenceSetFromEmployers(employersFile),
  variants.lineage.employers,
  variants.synthetic.canonicals_per_entity
);
const worksites = buildEntityFixture(
  "worksite",
  referenceSetFromWorksites(worksitesFile),
  variants.lineage.worksites,
  variants.synthetic.canonicals_per_entity
);

describe("DA0.3 replay harness (production reference of 2026-09-22)", () => {
  it("uses the production reference lists the plan quotes (187 / 39, 194 / 8)", () => {
    expect(employersFile.rows).toHaveLength(187);
    expect(employersFile.aliases).toHaveLength(39);
    expect(worksitesFile.rows).toHaveLength(194);
    expect(worksitesFile.aliases).toHaveLength(8);
  });

  it("the replay file has >= 2,000 rows so the apply batch loop runs more than once", () => {
    const rows = buildRows(employers.strings, worksites.strings, variants.rows.target);
    expect(rows.length).toBe(expected.file.rows);
    expect(rows.length).toBeGreaterThanOrEqual(2000);
    expect(employers.strings).toHaveLength(expected.file.distinctEmployerStrings);
    expect(worksites.strings).toHaveLength(expected.file.distinctWorksiteStrings);
    for (const r of rows.slice(0, 5)) {
      expect(r["First Name"]).toBe("Fixture");
      expect(r.Email).toMatch(/@example\.invalid$/);
    }
  });

  it("creates 0 employers and 0 worksites: every resolved id is a reference row", () => {
    for (const fx of [employers, worksites]) {
      const ids = new Set(fx.ref.rows.map((r) => r.id));
      const outcomes = resolveNames(fx.entity, fx.strings, fx.ref);
      for (const o of outcomes) {
        if (o.resolvedId != null) expect(ids.has(o.resolvedId)).toBe(true);
        for (const p of o.proposals) expect(ids.has(p.id)).toBe(true);
      }
    }
    expect(expected.createdEmployers).toBe(0);
    expect(expected.createdWorksites).toBe(0);
  });

  it("first pass counts equal fixtures/expected.json (A3: N queue rows; A6: aliases only for auto)", () => {
    const emp = computeExpectation(employers);
    const ws = computeExpectation(worksites);
    expect(emp.firstPass).toEqual(expected.employers.firstPass);
    expect(ws.firstPass).toEqual(expected.worksites.firstPass);
    expect(emp.queued + ws.queued).toBe(expected.queuedTotal);
    expect(emp.autoAliasesWritten).toBe(expected.employers.autoAliasesWritten);
    expect(ws.autoAliasesWritten).toBe(expected.worksites.autoAliasesWritten);
    // A6: exact / alias outcomes never write an alias.
    for (const fx of [employers, worksites]) {
      for (const o of resolveNames(fx.entity, fx.strings, fx.ref)) {
        if (o.status !== "auto") expect(o.writesAlias).toBe(false);
      }
    }
    // The queue counts the plan quotes
    expect(emp.firstPass.needs_review + emp.firstPass.unmatched).toBe(expected.employers.queued);
    expect(ws.firstPass.needs_review + ws.firstPass.unmatched).toBe(expected.worksites.queued);
  });

  it("every queued variant has a prescribed decision, and the decisions match expected.json", () => {
    const emp = computeExpectation(employers);
    const ws = computeExpectation(worksites);
    expect(emp.decisions).toEqual(expected.employers.decisions);
    expect(ws.decisions).toEqual(expected.worksites.decisions);
    expect(emp.referenceCollisions).toEqual(expected.employers.referenceCollisions);
    expect(ws.referenceCollisions).toEqual(expected.worksites.referenceCollisions);
  });

  it("second pass (A7): after the decisions, 0 variants are queued; only the reference's own fold collisions remain", () => {
    const emp = computeExpectation(employers);
    const ws = computeExpectation(worksites);
    expect(emp.secondPassQueuedFromVariants).toBe(0);
    expect(ws.secondPassQueuedFromVariants).toBe(0);
    expect(emp.secondPass).toEqual(expected.employers.secondPass);
    expect(ws.secondPass).toEqual(expected.worksites.secondPass);
    expect(emp.secondPass.auto).toBe(0);
    expect(ws.secondPass.auto).toBe(0);
    expect(emp.secondPass.needs_review + emp.secondPass.unmatched).toBe(emp.referenceCollisions.length);
    expect(ws.secondPass.needs_review + ws.secondPass.unmatched).toBe(ws.referenceCollisions.length);
    expect(expected.secondPassQueuedFromVariants).toBe(0);
  });

  it("case / spacing variants of canonical names are exact hits, not queue rows", () => {
    for (const fx of [employers, worksites]) {
      const byFold = new Map(resolveNames(fx.entity, fx.strings, fx.ref).map((o) => [o.normalisedName, o]));
      for (const v of fx.variants) {
        if (v.origin !== "synthetic") continue;
        const canonical = fx.ref.rows.find((r) => r.id === v.canonicalId)!;
        if (foldName(v.raw) === foldName(canonical.name)) {
          expect(byFold.get(foldName(v.raw))?.status).toBe("exact");
        }
      }
    }
  });
});
