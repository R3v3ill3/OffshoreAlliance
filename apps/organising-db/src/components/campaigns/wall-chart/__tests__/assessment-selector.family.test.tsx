// @vitest-environment jsdom
/**
 * WP3.8 (wp3.8.md §4.3) — the chart's Colour-by selector lists a family
 * assessment under "Shared from <parent>" with the " · shared" suffix, and
 * choosing it hands the parent's `activityId` to `onChange` (acceptance
 * item 3). Mounted under the WP2.3 harness on the `family` fixture knob; the
 * no-parent case pins today's groups.
 */

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authContextMock,
  fetchApiMock,
  navigationMock,
  resetSpies,
  sonnerMock,
  supabaseClientMock,
} from "./harness/mocks";
import { resetBackend } from "./harness/backend";
import { buildWallChartFixture } from "./harness/fixture";
import { selectOption } from "./harness/locate";
import { click, mountWallChart, type MountedWallChart } from "./harness/mount";

vi.mock("next/navigation", () => navigationMock());
vi.mock("@/lib/supabase/client", () => supabaseClientMock());
vi.mock("@/lib/api/fetch-api", () => fetchApiMock());
vi.mock("@/lib/supabase/auth-context", () => authContextMock());
vi.mock("sonner", () => sonnerMock());

// Imported last: it pulls in the mocked edges above.
import { AssessmentSelector } from "../assessment-selector";
import type { AssessmentSelection } from "../types";

const onChange = vi.fn<(next: AssessmentSelection) => void>();

/** Holds the selection the way the chart does, so the selector is fully controlled. */
function Wrapper({ campaignId }: { campaignId: string; canWrite: boolean }) {
  const [value, setValue] = useState<AssessmentSelection>({ kind: "cumulative" });
  return (
    <AssessmentSelector
      campaignId={campaignId}
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      triggerAriaLabel="Colour by"
    />
  );
}

function trigger(root: ParentNode): HTMLButtonElement {
  const el = root.querySelector<HTMLButtonElement>('button[role="combobox"]');
  if (!el) throw new Error("No selector trigger");
  return el;
}

function optionLabels(): string[] {
  return [...document.body.querySelectorAll('[role="option"]')].map((o) =>
    (o.textContent ?? "").replace(/\s+/gu, " ").trim()
  );
}

function groupLabels(): string[] {
  return [...document.body.querySelectorAll('[role="group"] > [id]')]
    .filter((el) => !el.getAttribute("role"))
    .map((el) => (el.textContent ?? "").replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

describe("assessment selector — campaign families", () => {
  let mounted: MountedWallChart | null = null;

  beforeEach(() => {
    resetSpies();
    onChange.mockReset();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
    resetBackend();
  });

  it("with a parent: lists the shared assessment under the parent's group and selects the parent's activity id", async () => {
    mounted = await mountWallChart({
      Component: Wrapper,
      fixture: buildWallChartFixture("small", {
        family: { parentId: 9, parentName: "ROV sector wide" },
      }),
    });

    // The options query is keyed by the parent and the parent query is cached.
    const keys = mounted.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain(JSON.stringify(["campaign-parent", 1]));
    expect(keys).toContain(JSON.stringify(["campaign-assessments-rated", "1", 9]));

    await click(trigger(mounted.container));
    expect(groupLabels()).toEqual(["Assessments", "Shared from ROV sector wide"]);
    expect(optionLabels()).toEqual([
      "Petition ask · no plan link · " + new Date("2026-01-02T00:00:00.000Z").toLocaleDateString(),
      "Sector petition · shared",
      "Cumulative",
    ]);

    await click(selectOption("Sector petition · shared"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      kind: "assessment",
      activityId: 901,
      title: "Sector petition",
      isBinary: false,
      supporterOutcomeValue: null,
      ratingLabels: null,
    });
  });

  it("with no parent: today's groups, no family group, key suffix 0", async () => {
    mounted = await mountWallChart({
      Component: Wrapper,
      fixture: buildWallChartFixture("small"),
    });

    const keys = mounted.queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain(JSON.stringify(["campaign-assessments-rated", "1", 0]));

    await click(trigger(mounted.container));
    expect(groupLabels()).toEqual(["Assessments"]);
    expect(optionLabels().some((l) => l.includes("shared"))).toBe(false);
    expect(optionLabels().some((l) => l.startsWith("Shared from"))).toBe(false);
  });
});
