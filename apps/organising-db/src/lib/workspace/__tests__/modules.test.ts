import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_MODULE_IDS,
  ALL_MODULE_IDS,
  MODULES,
  MODULE_IDS,
  ORGANISER_DEFAULT_MODULE_IDS,
  WORK_ROLE_VALUES,
  getModule,
  isWorkRole,
  isWorkspaceModuleId,
  type WorkspaceModuleId,
} from "../modules";

describe("workspace module registry", () => {
  it("has exactly the 13 plan-5.2 modules plus surveys_forms, in plan order, with unique ids", () => {
    expect(MODULES).toHaveLength(14);
    expect(MODULE_IDS).toEqual([
      "wall_chart_people",
      "actions",
      "setup",
      "inbox",
      "strategic_plan",
      "bargaining",
      "insights",
      "surveys_forms",
      "data_fields",
      "activists_wocs",
      "library",
      "imports",
      "organisation_databases",
      "administration",
    ]);
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length);
    expect(ALL_MODULE_IDS.size).toBe(14);
  });

  it("MODULE_IDS covers the WorkspaceModuleId union exhaustively", () => {
    // Fails to compile if a union member is missing from MODULE_IDS, and
    // fails at runtime if MODULE_IDS gains an id outside the union.
    const coverage = Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as Record<
      WorkspaceModuleId,
      true
    >;
    const expected = {
      wall_chart_people: true,
      actions: true,
      setup: true,
      inbox: true,
      strategic_plan: true,
      bargaining: true,
      insights: true,
      surveys_forms: true,
      data_fields: true,
      activists_wocs: true,
      library: true,
      imports: true,
      organisation_databases: true,
      administration: true,
    } satisfies Record<WorkspaceModuleId, true>;
    expect(coverage).toEqual(expected);
  });

  it("defaults the first four modules plus surveys_forms on for organisers", () => {
    const defaults = MODULES.filter((m) => m.defaultForOrganiser).map((m) => m.id);
    expect(defaults).toEqual(["wall_chart_people", "actions", "setup", "inbox", "surveys_forms"]);
    expect([...ORGANISER_DEFAULT_MODULE_IDS]).toEqual(defaults);
  });

  it("marks administration as the only admin-only module", () => {
    expect(MODULES.filter((m) => m.adminOnly).map((m) => m.id)).toEqual(["administration"]);
    expect([...ADMIN_ONLY_MODULE_IDS]).toEqual(["administration"]);
  });

  it("hides exactly the permission-shaped modules when off; the rest are muted", () => {
    const hidden = MODULES.filter((m) => m.offState === "hidden").map((m) => m.id);
    expect(hidden).toEqual(["imports", "administration"]);
    expect(MODULES.filter((m) => m.offState === "muted")).toHaveLength(12);
    // Orchestrator ruling (WP1.2 approval): organisation databases are
    // capability-shaped, so they are muted when off, not hidden.
    expect(getModule("organisation_databases").offState).toBe("muted");
  });

  it("gives every module a non-empty label and description using plan-3.6 wording", () => {
    for (const m of MODULES) {
      expect(m.label.trim().length, m.id).toBeGreaterThan(0);
      expect(m.description.trim().length, m.id).toBeGreaterThan(0);
      expect(m.label.toLowerCase(), m.id).not.toContain("episode");
      expect(m.description.toLowerCase(), m.id).not.toContain("episode");
    }
    expect(getModule("strategic_plan").label).toBe("Strategic plan");
    expect(getModule("wall_chart_people").label).toBe("Wall chart & people");
    expect(getModule("activists_wocs").label).toBe("Activists & WOCs");
    expect(getModule("surveys_forms").label).toBe("Surveys & Forms");
  });

  it("exposes the six legal work roles and the id guards", () => {
    expect([...WORK_ROLE_VALUES]).toEqual([
      "coordinator",
      "lead_organiser",
      "organiser",
      "industrial_officer",
      "industrial_coordinator",
      "specialist",
    ]);
    expect(isWorkRole("organiser")).toBe(true);
    expect(isWorkRole("admin")).toBe(false);
    expect(isWorkRole(null)).toBe(false);
    expect(isWorkspaceModuleId("actions")).toBe(true);
    expect(isWorkspaceModuleId("Actions")).toBe(false);
    expect(isWorkspaceModuleId(1)).toBe(false);
    expect(() => getModule("nope" as WorkspaceModuleId)).toThrow();
  });
});
