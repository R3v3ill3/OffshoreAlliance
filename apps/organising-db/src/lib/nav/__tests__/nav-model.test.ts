// WP1.2 — snapshots of `buildNavModel()` output, both modes and both roles.
//
// Why not rendered-component snapshots: `vitest.config.ts` is
// `environment: "node"` and neither `jsdom` nor `@testing-library/react` is a
// dependency. Adding two dev dependencies to satisfy the word "snapshot"
// would be the wrong trade for a package whose whole point is that the
// decision is already pure. `sidebar.tsx` and `mobile-nav.tsx` consume this
// identical model and differ only in two Tailwind class strings, so pinning
// the model pins both navs; the rendered markup is covered by
// `tests/e2e/organiser-nav.spec.ts`, which drives the real components in a
// real browser.
//
// Every case builds its input by calling the real `resolveWorkspace()` rather
// than hand-writing a Set, so the two packages stay welded: a change to
// `modules.ts` defaults fails a nav snapshot loudly instead of silently
// reshaping the sidebar.
//
// Note: `buildNavModel` takes `isAdmin`, not `role`, so `user` and `viewer`
// produce byte-identical models given identical modules. That is correct —
// `viewer` is a write gate, never a navigation gate — and cases 3 and 4
// asserting equal is itself the proof.

import { describe, expect, it } from "vitest";

import { ORGANISER_DEFAULT_MODULE_IDS, getModule } from "@/lib/workspace/modules";
import { resolveWorkspace, type ResolveWorkspaceInput } from "@/lib/workspace/resolve";
import { buildNavModel, type NavModel } from "../nav-model";

const BASE: ResolveWorkspaceInput = {
  role: "user",
  workRole: null,
  orgDefaults: undefined,
  userPrefs: undefined,
  sessionShowEverything: false,
};

function modelFor(
  input: Partial<ResolveWorkspaceInput>,
  opts: { isAdmin?: boolean; unreadEmail?: number } = {}
): NavModel {
  const resolveInput = { ...BASE, ...input };
  const resolved = resolveWorkspace(resolveInput);
  return buildNavModel({
    mode: resolved.mode,
    enabledModules: resolved.enabledModules,
    moduleState: (id) =>
      resolved.enabledModules.has(id) ? "on" : getModule(id).offState,
    isAdmin: opts.isAdmin ?? resolveInput.role === "admin",
    canShowEverything: resolved.canShowEverything,
    showEverything: resolveInput.sessionShowEverything,
    unreadEmail: opts.unreadEmail ?? 0,
  });
}

const ORGANISER_PREFS = { mode: "organiser" };

describe("buildNavModel", () => {
  it("1. full mode / admin", () => {
    expect(modelFor({ role: "admin" })).toMatchSnapshot();
  });

  it("2. full mode / user", () => {
    expect(modelFor({ role: "user" })).toMatchSnapshot();
  });

  it("3. organiser mode / user", () => {
    expect(modelFor({ role: "user", userPrefs: ORGANISER_PREFS })).toMatchSnapshot();
  });

  it("4. organiser mode / viewer (via the role default and the viewer→organiser lookup)", () => {
    expect(
      modelFor({
        role: "viewer",
        orgDefaults: { byWorkRole: { organiser: { mode: "organiser" } } },
      })
    ).toMatchSnapshot();
  });

  it("cases 3 and 4 are byte-identical: viewer is a write gate, never a nav gate", () => {
    expect(
      modelFor({
        role: "viewer",
        orgDefaults: { byWorkRole: { organiser: { mode: "organiser" } } },
      })
    ).toEqual(modelFor({ role: "user", userPrefs: ORGANISER_PREFS }));
  });

  it("5. organiser mode with `insights` on — Dashboard and Reports become live", () => {
    expect(
      modelFor({
        role: "user",
        userPrefs: {
          mode: "organiser",
          modules: [...ORGANISER_DEFAULT_MODULE_IDS, "insights"],
        },
      })
    ).toMatchSnapshot();
  });

  it("6. organiser mode with `organisation_databases` on — the three org rows become live", () => {
    expect(
      modelFor({
        role: "user",
        userPrefs: {
          mode: "organiser",
          modules: [...ORGANISER_DEFAULT_MODULE_IDS, "organisation_databases"],
        },
      })
    ).toMatchSnapshot();
  });

  it("7. organiser mode, Show everything on — full rows plus an active control", () => {
    expect(
      modelFor({
        role: "user",
        userPrefs: ORGANISER_PREFS,
        sessionShowEverything: true,
      })
    ).toMatchSnapshot();
  });

  it("8. organiser mode with allowShowEverything: false — no dead button", () => {
    expect(
      modelFor({
        role: "user",
        userPrefs: { mode: "organiser", allowShowEverything: false },
      })
    ).toMatchSnapshot();
  });

  it("9. organiser mode + isAdmin (unreachable today; the defensive branch)", () => {
    expect(
      modelFor({ role: "user", userPrefs: ORGANISER_PREFS }, { isAdmin: true })
    ).toMatchSnapshot();
  });

  it("carries the email unread count on the Inbox row only, and only when > 0", () => {
    const full = modelFor({ role: "user" }, { unreadEmail: 7 });
    expect(full.primary.filter((i) => i.badge != null).map((i) => [i.id, i.badge])).toEqual(
      [["email_inbox", 7]]
    );

    const organiser = modelFor(
      { role: "user", userPrefs: ORGANISER_PREFS },
      { unreadEmail: 7 }
    );
    expect(
      organiser.primary.filter((i) => i.badge != null).map((i) => [i.id, i.badge])
    ).toEqual([["inbox", 7]]);

    expect(
      modelFor({ role: "user" }, { unreadEmail: 0 }).primary.some((i) => "badge" in i)
    ).toBe(false);
  });

  it("show-everything control: hidden in genuinely-full mode, offered to an organiser", () => {
    expect(modelFor({ role: "admin" }).showEverythingControl).toBe("hidden");
    expect(modelFor({ role: "user" }).showEverythingControl).toBe("hidden");
    expect(modelFor({ role: "user", userPrefs: ORGANISER_PREFS }).showEverythingControl).toBe(
      "offer"
    );
    expect(
      modelFor({
        role: "user",
        userPrefs: ORGANISER_PREFS,
        sessionShowEverything: true,
      }).showEverythingControl
    ).toBe("active");
  });

  it("the Organisation section is collapsed on first render, and empty in full mode", () => {
    expect(modelFor({ role: "user", userPrefs: ORGANISER_PREFS }).organisation).toMatchObject({
      collapsed: true,
    });
    expect(modelFor({ role: "user" }).organisation).toEqual({ collapsed: false, items: [] });
  });
});
