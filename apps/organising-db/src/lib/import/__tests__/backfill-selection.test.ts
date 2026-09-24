import { describe, expect, it } from "vitest";

import { selectBackfillRows, type BackfillWorker } from "../backfill-selection";

const review = { normalisedName: "acme contracting", siblingImportIds: [10, 11, null] };

const workers: BackfillWorker[] = [
  { workerId: 1, fkId: null, rawName: "ACME  Contracting ", namesImportId: 10 },
  { workerId: 2, fkId: null, rawName: "Acme Contracting", namesImportId: 11 },
  { workerId: 3, fkId: 5, rawName: "acme contracting", namesImportId: 10 },
  { workerId: 4, fkId: null, rawName: "Other Co", namesImportId: 10 },
  { workerId: 5, fkId: null, rawName: "acme contracting", namesImportId: 12 },
  { workerId: 6, fkId: null, rawName: null, namesImportId: 10 },
  { workerId: 7, fkId: null, rawName: "acme contracting", namesImportId: null },
];

describe("selectBackfillRows (mirror of decide_name_match step 5)", () => {
  it("fills only a null FK with the same folded raw string from a queued import", () => {
    expect(selectBackfillRows(workers, review)).toEqual([1, 2]);
  });

  it("skips a non-null FK (nothing organiser-maintained is overwritten)", () => {
    expect(selectBackfillRows(workers, review)).not.toContain(3);
  });

  it("skips another raw string, another import, a null raw and a null import", () => {
    const picked = selectBackfillRows(workers, review);
    for (const id of [4, 5, 6, 7]) expect(picked).not.toContain(id);
  });

  it("returns nothing when no sibling import is known", () => {
    expect(selectBackfillRows(workers, { normalisedName: "acme contracting", siblingImportIds: [] })).toEqual([]);
  });
});
