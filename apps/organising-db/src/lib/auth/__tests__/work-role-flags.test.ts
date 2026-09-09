import { describe, expect, it } from "vitest";
import { LEAD_WORK_ROLES, deriveWorkRoleFlags } from "../work-role-flags";
import type { WorkRole } from "@/types/organising-row-types";

/** The six legal work_role values from the user_profiles CHECK (baseline B:9887-9900). */
const ALL_WORK_ROLES: WorkRole[] = [
  "coordinator",
  "lead_organiser",
  "organiser",
  "industrial_officer",
  "industrial_coordinator",
  "specialist",
];

describe("LEAD_WORK_ROLES", () => {
  it("is exactly the work_role arm of is_coordinator_or_lead()", () => {
    expect([...LEAD_WORK_ROLES].sort()).toEqual(
      ["coordinator", "industrial_coordinator", "lead_organiser"].sort()
    );
  });
});

describe("deriveWorkRoleFlags", () => {
  it("is all-false for a missing profile", () => {
    expect(deriveWorkRoleFlags(null)).toEqual({ isLeadOrganiser: false, isOrganiser: false });
    expect(deriveWorkRoleFlags(undefined)).toEqual({ isLeadOrganiser: false, isOrganiser: false });
  });

  it("is all-false for work_role null", () => {
    expect(deriveWorkRoleFlags({ work_role: null })).toEqual({
      isLeadOrganiser: false,
      isOrganiser: false,
    });
  });

  it.each([
    ["lead_organiser", true, true],
    ["coordinator", true, true],
    ["industrial_coordinator", true, true],
    ["organiser", false, true],
    ["industrial_officer", false, false],
    ["specialist", false, false],
  ] as const)("%s -> isLeadOrganiser=%s isOrganiser=%s", (workRole, lead, organiser) => {
    expect(deriveWorkRoleFlags({ work_role: workRole })).toEqual({
      isLeadOrganiser: lead,
      isOrganiser: organiser,
    });
  });

  it("covers every legal work_role value", () => {
    // Guards against a new CHECK value silently defaulting to "not an organiser".
    for (const workRole of ALL_WORK_ROLES) {
      const flags = deriveWorkRoleFlags({ work_role: workRole });
      expect(typeof flags.isLeadOrganiser).toBe("boolean");
      expect(typeof flags.isOrganiser).toBe("boolean");
    }
  });

  it("treats an unknown string as neither lead nor organiser", () => {
    expect(deriveWorkRoleFlags({ work_role: "admin" as unknown as WorkRole })).toEqual({
      isLeadOrganiser: false,
      isOrganiser: false,
    });
  });

  it("every lead is also an organiser", () => {
    for (const workRole of LEAD_WORK_ROLES) {
      expect(deriveWorkRoleFlags({ work_role: workRole }).isOrganiser).toBe(true);
    }
  });
});
