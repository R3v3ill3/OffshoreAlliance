/** WP2.4 (SY-c, wp2.4.md §3.14, §4.1) — the sync-on-open sentence. */

import { describe, expect, it } from "vitest";
import { syncChangedSomething, syncNoticeMessage } from "../sync-notice-message";

describe("syncNoticeMessage", () => {
  it("renders every clause, in order, with plurals", () => {
    expect(
      syncNoticeMessage({ membersAdded: 12, ouAssignmentsUpserted: 9, ouAssignmentsSkipped: 3 })
    ).toBe("Sync on open: 12 workers added to this campaign, 9 placed in units, 3 already placed.");
  });

  it("handles singulars (the §4.5 step-5 sentence)", () => {
    expect(
      syncNoticeMessage({ success: true, workersAdded: 3, membersAdded: 1, ouAssignmentsUpserted: 2, ouAssignmentsSkipped: 1 })
    ).toBe("Sync on open: 1 worker added to this campaign, 2 placed in units, 1 already placed.");
    expect(syncNoticeMessage({ membersAdded: 0, ouAssignmentsUpserted: 1 })).toBe("Sync on open: 1 placed in a unit.");
  });

  it("omits a clause whose count is 0 or absent", () => {
    expect(syncNoticeMessage({ membersAdded: 2 })).toBe("Sync on open: 2 workers added to this campaign.");
    expect(syncNoticeMessage({ membersAdded: 0, ouAssignmentsUpserted: 4, ouAssignmentsSkipped: 0 })).toBe("Sync on open: 4 placed in units.");
  });

  it("is null when every count is 0, absent, or the input is not an object", () => {
    expect(syncNoticeMessage({ membersAdded: 0, ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 0 })).toBeNull();
    expect(syncNoticeMessage({})).toBeNull();
    expect(syncNoticeMessage({ success: true })).toBeNull();
    for (const v of [null, undefined, "x", 3, []]) expect(syncNoticeMessage(v), String(v)).toBeNull();
  });

  it("'already placed' and 'kept' are context, never a change: on their own they produce no notice", () => {
    expect(syncNoticeMessage({ ouAssignmentsSkipped: 40 })).toBeNull();
    expect(syncNoticeMessage({ manualPlacementsKept: 2 })).toBeNull();
    expect(syncNoticeMessage({ ouAssignmentsSkipped: 40, manualPlacementsKept: 2 })).toBeNull();
    expect(syncChangedSomething({ ouAssignmentsSkipped: 40, manualPlacementsKept: 2 })).toBe(false);
  });

  it("ignores workersAdded (every matched member) and unknown keys, and treats non-numbers and negatives as 0", () => {
    expect(syncNoticeMessage({ workersAdded: 95, membersAdded: 0, ouAssignmentsUpserted: 0 })).toBeNull();
    expect(syncNoticeMessage({ membersAdded: "3", ouAssignmentsUpserted: -1, ouAssignmentsSkipped: NaN, extra: 7 })).toBeNull();
    expect(syncNoticeMessage({ membersAdded: 2.9 })).toBe("Sync on open: 2 workers added to this campaign.");
  });

  it("accepts the WP2.4b counts (moved / kept) and renders them after the WP2.4 clauses", () => {
    expect(
      syncNoticeMessage({ membersAdded: 1, ouAssignmentsUpserted: 0, ouAssignmentsSkipped: 3, placementsMoved: 2, manualPlacementsKept: 1 })
    ).toBe(
      "Sync on open: 1 worker added to this campaign, 3 already placed, 2 moved to match their current site, 1 kept where an organiser placed them."
    );
    expect(syncNoticeMessage({ placementsMoved: 1 })).toBe("Sync on open: 1 moved to match their current site.");
    expect(syncChangedSomething({ placementsMoved: 1 })).toBe(true);
  });
});
