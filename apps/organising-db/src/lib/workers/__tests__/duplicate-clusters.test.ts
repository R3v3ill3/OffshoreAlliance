import { describe, expect, it } from "vitest";
import { findDuplicateClusters, type DuplicateCandidate } from "../duplicate-clusters";

function w(overrides: Partial<DuplicateCandidate> & Pick<DuplicateCandidate, "worker_id">): DuplicateCandidate {
  return {
    first_name: "Alex",
    last_name: "Taylor",
    email: null,
    phone: null,
    ...overrides,
  };
}

describe("findDuplicateClusters", () => {
  it("clusters workers sharing an email", () => {
    const clusters = findDuplicateClusters([
      w({ worker_id: 1, email: "Alex@Example.com", phone: "0400111222" }),
      w({ worker_id: 2, email: "alex@example.com", first_name: "A.", last_name: "Taylor" }),
      w({ worker_id: 3, first_name: "Sam", last_name: "Lee", email: "other@example.com" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toContain("email");
    expect(clusters[0].confidence).toBe("high");
    expect(clusters[0].workers.map((x) => x.worker_id).sort()).toEqual([1, 2]);
  });

  it("clusters by normalised phone", () => {
    const clusters = findDuplicateClusters([
      w({ worker_id: 10, first_name: "Pat", last_name: "Ng", phone: "+61 400 111 222" }),
      w({ worker_id: 11, first_name: "Patricia", last_name: "Ng", phone: "0400111222" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toContain("phone");
  });

  it("flags name-only matches as lower confidence", () => {
    const clusters = findDuplicateClusters([
      w({ worker_id: 4, email: "one@example.com" }),
      w({ worker_id: 5, email: "two@example.com" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons).toEqual(["name"]);
    expect(clusters[0].confidence).toBe("name");
  });

  it("returns nothing when every worker is distinct", () => {
    expect(
      findDuplicateClusters([
        w({ worker_id: 1, first_name: "A", last_name: "One", email: "a@x.com" }),
        w({ worker_id: 2, first_name: "B", last_name: "Two", email: "b@x.com" }),
      ])
    ).toEqual([]);
  });

  it("prefers the more complete record as suggested keep", () => {
    const clusters = findDuplicateClusters([
      w({ worker_id: 8, email: "same@example.com" }),
      w({
        worker_id: 9,
        email: "same@example.com",
        phone: "0400999888",
        employer_name: "Acme",
      }),
    ]);
    expect(clusters[0].suggested_keep_id).toBe(9);
  });

  it("does not fold a same-name outsider into an email cluster", () => {
    const clusters = findDuplicateClusters([
      w({ worker_id: 1, email: "shared@example.com" }),
      w({ worker_id: 2, email: "shared@example.com", first_name: "A.", last_name: "Taylor" }),
      w({ worker_id: 3, email: "other@example.com" }),
    ]);
    const high = clusters.filter((c) => c.confidence === "high");
    const byName = clusters.filter((c) => c.confidence === "name");
    expect(high).toHaveLength(1);
    expect(high[0].workers.map((x) => x.worker_id).sort()).toEqual([1, 2]);
    expect(byName).toHaveLength(1);
    expect(byName[0].workers.map((x) => x.worker_id).sort()).toEqual([1, 3]);
  });
});
