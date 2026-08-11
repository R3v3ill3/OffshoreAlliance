import { describe, expect, it } from "vitest";
import {
  computeBlastCohortWorkerIds,
  computeSurveyCohortWorkerIds,
  type BlastCohortItem,
  type SurveyCohortSession,
} from "../reporting-cohorts";

const ITEMS: BlastCohortItem[] = [
  // Replied after send.
  { worker_id: 1, status: "delivered", sent_at: "2026-08-10T02:00:00Z" },
  // Delivered, inbound was BEFORE the send — not a response.
  { worker_id: 2, status: "delivered", sent_at: "2026-08-10T02:00:00Z" },
  // Delivered, never replied.
  { worker_id: 3, status: "delivered", sent_at: "2026-08-10T02:00:00Z" },
  // Failed.
  { worker_id: 4, status: "failed", sent_at: "2026-08-10T02:00:00Z" },
  // Never sent (skipped) — belongs to no cohort.
  { worker_id: 5, status: "skipped", sent_at: null },
];

const INBOUND = new Map<number, string>([
  [1, "2026-08-10T03:00:00Z"], // after send
  [2, "2026-08-09T10:00:00Z"], // before send
]);

describe("computeBlastCohortWorkerIds", () => {
  it("replied = inbound at/after the item's send time", () => {
    expect(computeBlastCohortWorkerIds(ITEMS, INBOUND, "replied")).toEqual([1]);
  });

  it("delivered_not_replied excludes responders and non-delivered", () => {
    expect(
      computeBlastCohortWorkerIds(ITEMS, INBOUND, "delivered_not_replied").sort(),
    ).toEqual([2, 3]);
  });

  it("failed picks failed items only", () => {
    expect(computeBlastCohortWorkerIds(ITEMS, INBOUND, "failed")).toEqual([4]);
  });

  it("deduplicates a worker on multiple items", () => {
    const doubled = [...ITEMS, { worker_id: 4, status: "failed", sent_at: null }];
    expect(computeBlastCohortWorkerIds(doubled, INBOUND, "failed")).toEqual([4]);
  });
});

const SESSIONS: SurveyCohortSession[] = [
  { worker_id: 1, state: "completed", first_answer_at: "2026-08-10T03:00:00Z" },
  { worker_id: 2, state: "active", first_answer_at: "2026-08-10T03:05:00Z" },
  { worker_id: 3, state: "expired", first_answer_at: "2026-08-10T03:10:00Z" },
  { worker_id: 4, state: "invited", first_answer_at: null },
  { worker_id: 5, state: "expired", first_answer_at: null },
  { worker_id: 6, state: "opted_out", first_answer_at: null },
  { worker_id: 7, state: "undeliverable", first_answer_at: null },
];

describe("computeSurveyCohortWorkerIds", () => {
  it("completed = completed sessions", () => {
    expect(computeSurveyCohortWorkerIds(SESSIONS, "completed")).toEqual([1]);
  });

  it("started_not_completed = answered something but did not finish", () => {
    expect(
      computeSurveyCohortWorkerIds(SESSIONS, "started_not_completed").sort(),
    ).toEqual([2, 3]);
  });

  it("non_responders = never answered, excluding opt-outs", () => {
    expect(computeSurveyCohortWorkerIds(SESSIONS, "non_responders").sort()).toEqual([
      4, 5, 7,
    ]);
  });
});
