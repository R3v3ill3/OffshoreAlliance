/**
 * DA0.3 replay fixture builder (plan §3.4). No database access.
 *
 * Run from apps/organising-db (so @oa/employer-matching and xlsx resolve):
 *   pnpm exec tsx ../../scripts/data-hygiene/da0.3/build-fixture.ts
 *
 * Reads  fixtures/reference_employers.json, reference_worksites.json (01 export)
 *        fixtures/variants.json
 * Writes fixtures/replay_status_sync.xlsx (status-sync layout, >= 2,000 rows,
 *        synthetic person columns) and fixtures/expected.json (the harness's
 *        counts: plan §4 rows A3 / A6 / A7).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEntityFixture,
  buildRows,
  computeExpectation,
  referenceSetFromEmployers,
  referenceSetFromWorksites,
  type ReferenceEmployersFile,
  type ReferenceWorksitesFile,
  type VariantsFile,
} from "./fixture-lib";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "fixtures");
const appRequire = createRequire(resolve(here, "../../../apps/organising-db/package.json"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = appRequire("xlsx") as typeof import("xlsx");

const readJson = <T>(name: string): T => JSON.parse(readFileSync(resolve(fixtures, name), "utf8")) as T;

const employersFile = readJson<ReferenceEmployersFile>("reference_employers.json");
const worksitesFile = readJson<ReferenceWorksitesFile>("reference_worksites.json");
const variants = readJson<VariantsFile>("variants.json");

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

const employerExpectation = computeExpectation(employers);
const worksiteExpectation = computeExpectation(worksites);
const rows = buildRows(employers.strings, worksites.strings, variants.rows.target);

const rowsDigest = createHash("sha256")
  .update(rows.map((r) => `${r["Company Name"]}|${r["Employee Worksite"]}`).join("\n"))
  .digest("hex");

const expected = {
  note: "Computed by build-fixture.ts from the reference lists and variants.json; asserted by replay-fixture.test.ts. Against the production reference of 2026-09-22.",
  reference: {
    employers: { exported_at: employersFile.exported_at, rows: employersFile.rows.length, aliases: employersFile.aliases.length },
    worksites: { exported_at: worksitesFile.exported_at, rows: worksitesFile.rows.length, aliases: worksitesFile.aliases.length },
  },
  file: { rows: rows.length, distinctEmployerStrings: employers.strings.length, distinctWorksiteStrings: worksites.strings.length, rowsSha256: rowsDigest },
  employers: employerExpectation,
  worksites: worksiteExpectation,
  queuedTotal: employerExpectation.queued + worksiteExpectation.queued,
  createdEmployers: 0,
  createdWorksites: 0,
  secondPassQueuedTotal:
    employerExpectation.secondPass.needs_review +
    employerExpectation.secondPass.unmatched +
    worksiteExpectation.secondPass.needs_review +
    worksiteExpectation.secondPass.unmatched,
  /** Only the reference's own fold collisions may remain queued after the decisions. */
  secondPassQueuedFromVariants:
    employerExpectation.secondPassQueuedFromVariants + worksiteExpectation.secondPassQueuedFromVariants,
};

writeFileSync(resolve(fixtures, "expected.json"), JSON.stringify(expected, null, 2) + "\n");

const sheet = XLSX.utils.json_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, "Members");
book.Props = { Title: "DA0.3 replay fixture (synthetic)", CreatedDate: new Date("2026-09-22T00:00:00Z") };
XLSX.writeFile(book, resolve(fixtures, "replay_status_sync.xlsx"), { compression: true });

console.log(JSON.stringify({ file: expected.file, employers: { ...employerExpectation, decisions: employerExpectation.decisions.length }, worksites: { ...worksiteExpectation, decisions: worksiteExpectation.decisions.length }, queuedTotal: expected.queuedTotal, secondPassQueuedTotal: expected.secondPassQueuedTotal }, null, 2));
