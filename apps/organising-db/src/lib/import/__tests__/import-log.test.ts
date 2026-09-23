import { describe, expect, it } from "vitest";

import { stripCampaignProtectedFields } from "@/lib/workers/campaign-protected-fields";
import { mergeImportLogTotals, rawNameColumns } from "../import-log";

describe("mergeImportLogTotals (one import_logs row per file)", () => {
  it("accumulates counts across batches", () => {
    const a = mergeImportLogTotals({ records_created: 0, records_updated: 0, errors: null }, { created: 3, updated: 2, errorsText: null });
    const b = mergeImportLogTotals(a, { created: 1, updated: 4, errorsText: "Row 7: bad" });
    expect(b).toEqual({ records_created: 4, records_updated: 6, errors: "Row 7: bad" });
  });

  it("joins error text with a newline and drops blanks", () => {
    const merged = mergeImportLogTotals(
      { records_created: 1, records_updated: 1, errors: "first" },
      { created: 0, updated: 0, errorsText: "  " }
    );
    expect(merged.errors).toBe("first");
    expect(mergeImportLogTotals(merged, { created: 0, updated: 0, errorsText: "second" }).errors).toBe("first\nsecond");
  });
});

describe("rawNameColumns (provenance on the worker row)", () => {
  it("create: writes both raw columns (null when absent) and the import id", () => {
    expect(rawNameColumns({ employerRaw: " Acme ", worksiteRaw: null, importId: 42 }, "create")).toEqual({
      employer_name_raw: "Acme",
      worksite_name_raw: null,
      names_import_id: 42,
    });
  });

  it("update: writes only the strings the file carries, and the import id only with them", () => {
    expect(rawNameColumns({ employerRaw: null, worksiteRaw: "KGP", importId: 42 }, "update")).toEqual({
      worksite_name_raw: "KGP",
      names_import_id: 42,
    });
    expect(rawNameColumns({ employerRaw: "", worksiteRaw: undefined, importId: 42 }, "update")).toEqual({});
  });

  it("never returns an FK column", () => {
    const cols = rawNameColumns({ employerRaw: "Acme", worksiteRaw: "KGP", importId: 1 }, "create");
    expect(Object.keys(cols)).toEqual(["employer_name_raw", "worksite_name_raw", "names_import_id"]);
  });

  it("survives the campaign-protected strip, which still removes the FKs", () => {
    const patch = {
      employer_id: 1,
      worksite_id: 2,
      canonical_occupation_id: 3,
      ...rawNameColumns({ employerRaw: "Acme", worksiteRaw: "KGP", importId: 9 }, "update"),
    };
    const { patch: stripped, protectedFields } = stripCampaignProtectedFields(patch, true);
    expect(protectedFields).toEqual(["employer_id", "worksite_id", "canonical_occupation_id"]);
    expect(stripped).toEqual({ employer_name_raw: "Acme", worksite_name_raw: "KGP", names_import_id: 9 });
  });
});
