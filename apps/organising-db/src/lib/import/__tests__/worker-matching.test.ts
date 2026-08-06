import { describe, expect, it } from "vitest";
import {
  matchRows,
  normaliseEmail,
  normalisePhone,
  type MatchableWorker,
} from "../worker-matching";

const workers: MatchableWorker[] = [
  {
    worker_id: 1,
    first_name: "Alice",
    last_name: "Nguyen",
    email: "Alice.Nguyen@example.com",
    phone: "0400 111 222",
    in_campaign: true,
  },
  {
    worker_id: 2,
    first_name: "Bob",
    last_name: "Smith",
    email: null,
    phone: "+61 400 333 444",
    in_campaign: false,
  },
  {
    worker_id: 3,
    first_name: "Charlie",
    last_name: "Brown",
    preferred_name: "Chuck",
    email: "charlie@example.com",
    phone: null,
    in_campaign: true,
  },
  {
    worker_id: 4,
    first_name: "Dana",
    last_name: "Jones",
    email: "dana.j@example.com",
    phone: null,
    in_campaign: true,
  },
  {
    worker_id: 5,
    first_name: "Dana",
    last_name: "Jones",
    email: "other.dana@example.com",
    phone: null,
    in_campaign: false,
  },
];

describe("normalisePhone", () => {
  it("normalises AU formats to local 04 form", () => {
    expect(normalisePhone("0400111222")).toBe("0400111222");
    expect(normalisePhone("400111222")).toBe("0400111222");
    expect(normalisePhone("+61 400 111 222")).toBe("0400111222");
    expect(normalisePhone("61-0400111222")).toBe("0400111222");
    expect(normalisePhone("(04) 0011 1222")).toBe("0400111222");
  });
  it("returns null for blanks", () => {
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone("n/a")).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("lower-cases and rejects non-emails", () => {
    expect(normaliseEmail("Alice.Nguyen@Example.com")).toBe("alice.nguyen@example.com");
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail("  ")).toBeNull();
  });
});

describe("matchRows", () => {
  it("auto-matches on email regardless of case", () => {
    const [r] = matchRows(
      [{ key: "0", emails: ["ALICE.NGUYEN@EXAMPLE.COM"], phones: [], firstName: "", lastName: "" }],
      workers
    );
    expect(r.disposition).toBe("auto");
    expect(r.match?.worker.worker_id).toBe(1);
    expect(r.match?.method).toBe("email");
  });

  it("auto-matches +61 phone against local 04 record", () => {
    const [r] = matchRows(
      [{ key: "0", emails: [], phones: ["0400333444"], firstName: "", lastName: "" }],
      workers
    );
    expect(r.disposition).toBe("auto");
    expect(r.match?.worker.worker_id).toBe(2);
    expect(r.match?.method).toBe("phone");
  });

  it("needs confirmation for a unique name-only match", () => {
    const [r] = matchRows(
      [{ key: "0", emails: [], phones: [], firstName: "bob", lastName: "SMITH" }],
      workers
    );
    expect(r.disposition).toBe("confirm");
    expect(r.match?.worker.worker_id).toBe(2);
    expect(r.match?.method).toBe("name");
  });

  it("matches preferred name as an alternate first name", () => {
    const [r] = matchRows(
      [{ key: "0", emails: [], phones: [], firstName: "Chuck", lastName: "Brown" }],
      workers
    );
    expect(r.disposition).toBe("confirm");
    expect(r.match?.worker.worker_id).toBe(3);
  });

  it("sends ambiguous name matches to review with candidates", () => {
    const [r] = matchRows(
      [{ key: "0", emails: [], phones: [], firstName: "Dana", lastName: "Jones" }],
      workers
    );
    expect(r.disposition).toBe("review");
    expect(r.match).toBeNull();
    expect(r.candidates.map((c) => c.worker.worker_id)).toEqual([4, 5]);
  });

  it("prefers in-campaign workers on equal-tier hits", () => {
    const twoWithSameEmail: MatchableWorker[] = [
      { ...workers[1], worker_id: 10, email: "shared@example.com", in_campaign: false },
      { ...workers[0], worker_id: 11, email: "shared@example.com", in_campaign: true },
    ];
    const [r] = matchRows(
      [{ key: "0", emails: ["shared@example.com"], phones: [], firstName: "", lastName: "" }],
      twoWithSameEmail
    );
    expect(r.match?.worker.worker_id).toBe(11);
  });

  it("returns unmatched when nothing hits", () => {
    const [r] = matchRows(
      [{ key: "0", emails: ["ghost@example.com"], phones: ["0499999999"], firstName: "No", lastName: "One" }],
      workers
    );
    expect(r.disposition).toBe("unmatched");
    expect(r.candidates).toEqual([]);
  });

  it("email outranks a conflicting name hit", () => {
    const [r] = matchRows(
      [
        {
          key: "0",
          emails: ["charlie@example.com"],
          phones: [],
          firstName: "Bob",
          lastName: "Smith",
        },
      ],
      workers
    );
    expect(r.disposition).toBe("auto");
    expect(r.match?.worker.worker_id).toBe(3);
    // but the name candidate is still offered for the UI
    expect(r.candidates.some((c) => c.worker.worker_id === 2)).toBe(true);
  });
});
