import { describe, expect, it } from "vitest";
import { buildWorkerImportUpdatePatch } from "../worker-import-update-patch";

const NOW = "2026-09-17T00:00:00.000Z";

function fullRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    first_name: "Mark",
    last_name: "Modra",
    preferred_name: null,
    reference_id: "WA1053672",
    email: "mark@example.com",
    phone: "0448504801",
    union_membership_type_id: 3,
    member_role_type_id: null,
    union_id: null,
    resignation_date: null,
    join_date: null,
    worksite_id: 20,
    employer_id: 10,
    canonical_occupation_id: 30,
    notes: null,
    is_active: true,
    updated_at: NOW,
    non_oa_union_option_id: null,
    ...over,
  };
}

describe("buildWorkerImportUpdatePatch", () => {
  it("keeps values the file carries and drops nulls for unmapped columns", () => {
    const { patch, skippedKeys } = buildWorkerImportUpdatePatch(fullRow(), {
      membershipResolved: true,
    });
    expect(patch).toEqual({
      first_name: "Mark",
      last_name: "Modra",
      reference_id: "WA1053672",
      email: "mark@example.com",
      phone: "0448504801",
      worksite_id: 20,
      employer_id: 10,
      canonical_occupation_id: 30,
      union_membership_type_id: 3,
      is_active: true,
      non_oa_union_option_id: null,
      updated_at: NOW,
    });
    expect(skippedKeys).toEqual([
      "preferred_name",
      "member_role_type_id",
      "union_id",
      "resignation_date",
      "join_date",
      "notes",
    ]);
  });

  it("leaves membership status alone when the row's status did not resolve", () => {
    const { patch, skippedKeys } = buildWorkerImportUpdatePatch(
      fullRow({ union_membership_type_id: null, is_active: true }),
      { membershipResolved: false }
    );
    expect(patch).not.toHaveProperty("union_membership_type_id");
    expect(patch).not.toHaveProperty("is_active");
    expect(patch).not.toHaveProperty("non_oa_union_option_id");
    expect(skippedKeys).toEqual(
      expect.arrayContaining(["union_membership_type_id", "is_active", "non_oa_union_option_id"])
    );
  });

  it("writes the membership set together, including a resigned status", () => {
    const { patch } = buildWorkerImportUpdatePatch(
      fullRow({ union_membership_type_id: 2, is_active: false, resignation_date: "2026-01-02" }),
      { membershipResolved: true }
    );
    expect(patch).toMatchObject({
      union_membership_type_id: 2,
      is_active: false,
      resignation_date: "2026-01-02",
    });
  });

  it("does not blank a name when the file has an empty one", () => {
    const { patch, skippedKeys } = buildWorkerImportUpdatePatch(fullRow({ last_name: "" }), {
      membershipResolved: true,
    });
    expect(patch).not.toHaveProperty("last_name");
    expect(skippedKeys).toContain("last_name");
  });

  it("treats an empty string like null for optional fields", () => {
    const { patch } = buildWorkerImportUpdatePatch(fullRow({ notes: "", email: "" }), {
      membershipResolved: true,
    });
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("email");
  });

  it("ignores keys it does not know so a future column cannot slip through unreviewed", () => {
    const { patch } = buildWorkerImportUpdatePatch(fullRow({ rejoin_date: "2026-01-01" }), {
      membershipResolved: true,
    });
    expect(patch).not.toHaveProperty("rejoin_date");
  });
});
