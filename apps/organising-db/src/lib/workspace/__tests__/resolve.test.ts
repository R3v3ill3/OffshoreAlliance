import { describe, expect, it } from "vitest";
import { modulesForRole, resolveWorkspace, type ResolveWorkspaceInput } from "../resolve";
import {
  MODULE_IDS,
  ORGANISER_DEFAULT_MODULE_IDS,
  WORK_ROLE_VALUES,
  type WorkspaceModuleId,
} from "../modules";
import type { UserRole, WorkRole } from "@/types/organising-row-types";

const ROLES: UserRole[] = ["admin", "user", "viewer"];
const WORK_ROLES: (WorkRole | null)[] = [...WORK_ROLE_VALUES, null];

const NON_ADMIN_MODULES = MODULE_IDS.filter((id) => id !== "administration");
const ORGANISER_DEFAULTS = [...ORGANISER_DEFAULT_MODULE_IDS];

function resolve(overrides: Partial<ResolveWorkspaceInput>) {
  return resolveWorkspace({
    role: "user",
    workRole: "organiser",
    orgDefaults: undefined,
    userPrefs: undefined,
    sessionShowEverything: false,
    ...overrides,
  });
}

function ids(set: Set<WorkspaceModuleId>): WorkspaceModuleId[] {
  return [...set].sort();
}

const ORG_ORGANISER_MODE = { byWorkRole: { organiser: { mode: "organiser" } } };

describe("modulesForRole", () => {
  it("gives admins every module and non-admins everything but administration", () => {
    expect(ids(modulesForRole("admin"))).toEqual([...MODULE_IDS].sort());
    expect(ids(modulesForRole("user"))).toEqual([...NON_ADMIN_MODULES].sort());
    expect(ids(modulesForRole("viewer"))).toEqual([...NON_ADMIN_MODULES].sort());
    expect(modulesForRole("user").has("administration")).toBe(false);
  });
});

describe("resolveWorkspace", () => {
  it("T1 (R1): nothing stored resolves to full for every role and work role — the acceptance criterion", () => {
    for (const role of ROLES) {
      for (const workRole of WORK_ROLES) {
        for (const stored of [undefined, null, {}]) {
          const r = resolve({ role, workRole, orgDefaults: stored, userPrefs: stored });
          expect(r.mode, `${role}/${workRole}`).toBe("full");
          expect(r.source, `${role}/${workRole}`).toBe(role === "admin" ? "role" : "default");
          expect(ids(r.enabledModules), `${role}/${workRole}`).toEqual(ids(modulesForRole(role)));
        }
      }
    }
  });

  it("T2 (R2): admins are always full and ignore org defaults and user prefs", () => {
    const r = resolve({
      role: "admin",
      workRole: "organiser",
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { mode: "organiser", modules: ["actions"] },
    });
    expect(r.mode).toBe("full");
    expect(r.source).toBe("role");
    expect(r.enabledModules.has("administration")).toBe(true);
    expect(r.enabledModules.size).toBe(MODULE_IDS.length);
    expect(r.canShowEverything).toBe(false);
  });

  it("T3 (R4/R6): org default organiser with no modules gives the five registry defaults", () => {
    const r = resolve({ orgDefaults: ORG_ORGANISER_MODE });
    expect(r.mode).toBe("organiser");
    expect(r.source).toBe("role");
    expect(ids(r.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());
    // The four plan-5.2 defaults plus surveys_forms (the AN survey importer).
    expect([...ORGANISER_DEFAULTS].sort()).toEqual([
      "actions",
      "inbox",
      "setup",
      "surveys_forms",
      "wall_chart_people",
    ]);
  });

  it("T4 (R4/R6): org default organiser with explicit modules gives exactly those ids", () => {
    const r = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["actions", "library"] } } },
    });
    expect(r.mode).toBe("organiser");
    expect(ids(r.enabledModules)).toEqual(["actions", "library"]);
  });

  it("T5 (R4): each work role resolves by its own key", () => {
    const orgDefaults = {
      byWorkRole: { organiser: { mode: "organiser" }, lead_organiser: { mode: "full" } },
    };
    const organiser = resolve({ workRole: "organiser", orgDefaults });
    const lead = resolve({ workRole: "lead_organiser", orgDefaults });
    const coordinator = resolve({ workRole: "coordinator", orgDefaults });
    expect(organiser.mode).toBe("organiser");
    expect(organiser.source).toBe("role");
    expect(lead.mode).toBe("full");
    expect(lead.source).toBe("role");
    expect(ids(lead.enabledModules)).toEqual([...NON_ADMIN_MODULES].sort());
    expect(coordinator.mode).toBe("full");
    expect(coordinator.source).toBe("default");
  });

  it("T6 (R5): a user mode override beats the role default in both directions", () => {
    const up = resolve({ orgDefaults: ORG_ORGANISER_MODE, userPrefs: { mode: "full" } });
    expect(up.mode).toBe("full");
    expect(up.source).toBe("user");
    expect(ids(up.enabledModules)).toEqual([...NON_ADMIN_MODULES].sort());

    const down = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "full" } } },
      userPrefs: { mode: "organiser" },
    });
    expect(down.mode).toBe("organiser");
    expect(down.source).toBe("user");
    expect(ids(down.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());
  });

  it("T7 (R5/R6): user modules replace the role list wholesale, not as a union", () => {
    const r = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["actions", "inbox"] } } },
      userPrefs: { modules: ["library"] },
    });
    expect(r.mode).toBe("organiser");
    expect(r.source).toBe("role");
    expect(ids(r.enabledModules)).toEqual(["library"]);
  });

  it("T8 (R3): administration never survives for a non-admin, from any source", () => {
    const fromPrefs = resolve({
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { modules: ["administration", "actions"] },
    });
    expect(ids(fromPrefs.enabledModules)).toEqual(["actions"]);

    const fromOrg = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["administration", "actions"] } } },
    });
    expect(ids(fromOrg.enabledModules)).toEqual(["actions"]);

    const viewer = resolve({
      role: "viewer",
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["administration"] } } },
    });
    expect(viewer.enabledModules.size).toBe(0);

    const expanded = resolve({ orgDefaults: ORG_ORGANISER_MODE, sessionShowEverything: true });
    expect(expanded.enabledModules.has("administration")).toBe(false);
  });

  it("T9 (R4): a viewer with no work role follows the organiser entry", () => {
    const r = resolve({ role: "viewer", workRole: null, orgDefaults: ORG_ORGANISER_MODE });
    expect(r.mode).toBe("organiser");
    expect(r.source).toBe("role");
    expect(ids(r.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());
    expect(r.enabledModules.has("administration")).toBe(false);

    // A `user` with no work role has no entry and falls to R1.
    const user = resolve({ role: "user", workRole: null, orgDefaults: ORG_ORGANISER_MODE });
    expect(user.mode).toBe("full");
    expect(user.source).toBe("default");
  });

  it("T10 (R9): session Show everything expands organiser mode to full and stays reversible", () => {
    const r = resolve({ orgDefaults: ORG_ORGANISER_MODE, sessionShowEverything: true });
    expect(r.mode).toBe("full");
    expect(r.source).toBe("session");
    expect(ids(r.enabledModules)).toEqual([...NON_ADMIN_MODULES].sort());
    expect(r.canShowEverything).toBe(true);
  });

  it("T11 (R8/R9): allowShowEverything false blocks the session toggle, from the role entry or the user pref", () => {
    const viaRole = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", allowShowEverything: false } } },
      sessionShowEverything: true,
    });
    expect(viaRole.mode).toBe("organiser");
    expect(viaRole.source).toBe("role");
    expect(viaRole.canShowEverything).toBe(false);

    const viaUser = resolve({
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { allowShowEverything: false },
      sessionShowEverything: true,
    });
    expect(viaUser.mode).toBe("organiser");
    expect(viaUser.canShowEverything).toBe(false);

    // The user pref is read first: it can re-allow what the role entry denied.
    const userReallows = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", allowShowEverything: false } } },
      userPrefs: { allowShowEverything: true },
      sessionShowEverything: true,
    });
    expect(userReallows.mode).toBe("full");
    expect(userReallows.source).toBe("session");
  });

  it("T12 (R9): an already-full mode ignores the session toggle and keeps its source", () => {
    const fromDefault = resolve({ sessionShowEverything: true });
    expect(fromDefault.mode).toBe("full");
    expect(fromDefault.source).toBe("default");
    expect(fromDefault.canShowEverything).toBe(false);

    const fromRole = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "full" } } },
      sessionShowEverything: true,
    });
    expect(fromRole.source).toBe("role");

    const fromUser = resolve({
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { mode: "full" },
      sessionShowEverything: true,
    });
    expect(fromUser.source).toBe("user");
  });

  it("T13 (R7): unknown ids are dropped, duplicates collapse, nothing throws", () => {
    const r = resolve({
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { modules: ["wall_chart_people", "not_a_module", "actions", "actions"] },
    });
    expect(r.mode).toBe("organiser");
    expect(ids(r.enabledModules)).toEqual(["actions", "wall_chart_people"]);
    expect(r.enabledModules.size).toBe(2);
  });

  it("T14 (R10): malformed org defaults resolve to full/default without throwing", () => {
    // The last two are malformed only in the *organiser entry*, which is now
    // dropped on its own (fix round 1, finding 6) rather than nulling the
    // whole document — the organiser still has no usable entry either way.
    const malformed: unknown[] = [
      null,
      undefined,
      "x",
      [],
      { byWorkRole: 5 },
      { byWorkRole: { organiser: "x" } },
      { byWorkRole: { organiser: { mode: "simple" } } },
    ];
    for (const orgDefaults of malformed) {
      const r = resolve({ orgDefaults });
      expect(r.mode, JSON.stringify(orgDefaults)).toBe("full");
      expect(r.source, JSON.stringify(orgDefaults)).toBe("default");
      expect(ids(r.enabledModules)).toEqual([...NON_ADMIN_MODULES].sort());
    }
  });

  it("T14b (R10): one unusable role entry does not disable the entries beside it", () => {
    const orgDefaults = {
      byWorkRole: {
        coordinator: "not an entry",
        organiser: { mode: "organiser", modules: ["actions", "library"] },
      },
    };
    const organiser = resolve({ workRole: "organiser", orgDefaults });
    expect(organiser.mode).toBe("organiser");
    expect(organiser.source).toBe("role");
    expect(ids(organiser.enabledModules)).toEqual(["actions", "library"]);

    // The broken entry's own role falls back to full/default, not to a crash.
    const coordinator = resolve({ workRole: "coordinator", orgDefaults });
    expect(coordinator.mode).toBe("full");
    expect(coordinator.source).toBe("default");
  });

  it("T17 (R6): an empty modules array is treated as not provided, never as zero modules", () => {
    // From the user prefs: falls through to the role entry's list.
    const overRoleList = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["library"] } } },
      userPrefs: { modules: [] },
    });
    expect(overRoleList.mode).toBe("organiser");
    expect(ids(overRoleList.enabledModules)).toEqual(["library"]);

    // From the user prefs with no role list: falls through to the registry defaults.
    const overRegistry = resolve({
      orgDefaults: ORG_ORGANISER_MODE,
      userPrefs: { mode: "organiser", modules: [] },
    });
    expect(overRegistry.mode).toBe("organiser");
    expect(ids(overRegistry.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());

    // From the role entry: falls through to the registry defaults.
    const fromRole = resolve({
      orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: [] } } },
    });
    expect(fromRole.mode).toBe("organiser");
    expect(ids(fromRole.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());

    // The fallback is on the *stored* list only. A non-empty list that prunes
    // to nothing (R3) is still an explicit choice and stays empty — T8.
    expect(
      resolve({
        orgDefaults: { byWorkRole: { organiser: { mode: "organiser", modules: ["administration"] } } },
      }).enabledModules.size
    ).toBe(0);
  });

  it("T15 (R10): malformed user prefs leave the role default in force", () => {
    const malformed: unknown[] = [null, "x", [], 0, { mode: "simple" }, { modules: "actions" }];
    for (const userPrefs of malformed) {
      const r = resolve({ orgDefaults: ORG_ORGANISER_MODE, userPrefs });
      expect(r.mode, JSON.stringify(userPrefs)).toBe("organiser");
      expect(r.source, JSON.stringify(userPrefs)).toBe("role");
      expect(ids(r.enabledModules)).toEqual([...ORGANISER_DEFAULTS].sort());
    }
  });

  it("T16 (R8): canShowEverything defaults to true in organiser mode when nothing is stored about it (decision 1)", () => {
    const r = resolve({ orgDefaults: ORG_ORGANISER_MODE, userPrefs: {} });
    expect(r.mode).toBe("organiser");
    expect(r.canShowEverything).toBe(true);
    // ...and is false in full mode, where there is nothing more to show.
    expect(resolve({}).canShowEverything).toBe(false);
  });
});
