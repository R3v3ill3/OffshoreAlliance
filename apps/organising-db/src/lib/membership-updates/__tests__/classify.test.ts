import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  classifyWeeklyFile,
  dateFromFilename,
  kindFromFilename,
  resolveWeeklyFileGroup,
} from "../classify";

function workbook(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

const d = (m: number, day: number, h = 0) => new Date(Date.UTC(2026, m - 1, day, h));

// Synthetic rows in the column layouts of the four weekly exports.
const NEW = workbook([
  ["Branch", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Job Title", "Email", "Phone", "Member Joining Date", "Re Joined Date", "Resignation Date"],
  ["AWU-MUA Alliance WA", "WA1000001", "Ada", "Newby", "Contractor Co", "Pluto", "Rigger", "ada@example.com", "0400000001", d(9, 8), null, null],
  ["AWU-MUA Alliance WA", "WA1000002", "Ben", "Second", "Operator Ltd", "Barrow", "Scaffolder", "ben@example.com", "0400000002", d(9, 10), null, null],
]);
const RESIGNED = workbook([
  ["Branch", "Reference ID", "First Name", "Last Name", "Company Name", "Employee Worksite", "Joining Date", "Resignation Date", "Resignation Reason", "Email", "Phone", "Date Processed"],
  ["AWU-MUA Alliance WA", "WA3000001", "Dee", "Leaver", "Survey Co", "Offshore", d(2, 24), d(8, 3), "Moved Interstate", "dee@example.com", "0400000004", d(9, 9, 12)],
]);
const RECOMMENCED = workbook([
  ["Member Billing Item", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Member Account Status", "Membership Type", "Phone", "Email", "Job Title", "Date", "Old Value"],
  ["AWU-MUA Alliance WA", "WA2000001", "Cal", "Return", "Marine Group", "NWS", "Active", "Financial", "0400000003", "cal@example.com", "Master", d(9, 9, 23), "Non-Financial"],
]);
const UNFINANCIAL = workbook([
  ["Member Billing Item", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Member Account Status", "Membership Type", "Phone", "Email", "Job Title", "Date"],
  ["AWU-MUA Alliance WA", "WA4000001", "Eli", "Lapsed", "Maint Group", "KGP", "Stopped Payment", "Non-Financial", "0400000005", "eli@example.com", "Fitter", d(9, 8, 23)],
]);
/** The shared recommenced/unfinancial layout with nothing to tell them apart. */
const SHARED_LAYOUT_EMPTY = workbook([
  ["Member Billing Item", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Member Account Status", "Membership Type", "Phone", "Email", "Job Title", "Date"],
]);
const UNRELATED = workbook([
  ["Worksite", "Employer", "Headcount"],
  ["Pluto", "Operator Ltd", 120],
]);

/** Arrived the morning after week ending Thu 10 Sep 2026. */
const ARRIVED = new Date("2026-09-11T01:30:00Z");

describe("kindFromFilename", () => {
  it("reads the kind from the usual and the variant names", () => {
    expect(kindFromFilename("OA - New Members - w-e 10-09-2026.xlsx")).toBe("new");
    expect(kindFromFilename("OA-New-Members -w-e 10-09-2026.xlsx")).toBe("new");
    expect(kindFromFilename("OA_-_New_Members_-_w-e_10-09-2026.xlsx")).toBe("new");
    expect(kindFromFilename("OA Joins 409.xlsx")).toBe("new");
    expect(kindFromFilename("OA - Recommenced Members - w-e 10-09-2026.xlsx")).toBe("recommenced");
    expect(kindFromFilename("OA Rejoins 409.xlsx")).toBe("recommenced");
    expect(kindFromFilename("OA Re-joined 409.xlsx")).toBe("recommenced");
    expect(kindFromFilename("OA Recommencements 1009.xlsx")).toBe("recommenced");
    expect(kindFromFilename("OA - Resigned Members - w-e 10-09-2026.xlsx")).toBe("resigned");
    expect(kindFromFilename("OA Resignations 409.xlsx")).toBe("resigned");
    expect(kindFromFilename("OA - Unfinancial Members - w-e 10-09-2026.xlsx")).toBe("unfinancial");
    expect(kindFromFilename("OA Non-Financial 409.xlsx")).toBe("unfinancial");
    expect(kindFromFilename("attachments/OA - Resigned Members - w-e 10-09-2026.xlsx")).toBe("resigned");
  });

  it("names no kind, or more than one, as null", () => {
    expect(kindFromFilename("Full member list 1709.xlsx")).toBeNull();
    expect(kindFromFilename("OA - Active Members - w-e 10-09-2026.xlsx")).toBeNull();
    expect(kindFromFilename("New and Resigned 409.xlsx")).toBeNull();
    expect(kindFromFilename("")).toBeNull();
  });
});

describe("dateFromFilename", () => {
  const ref = ARRIVED;

  it("reads full dates day-first", () => {
    expect(dateFromFilename("OA - New Members - w-e 10-09-2026.xlsx", ref)).toEqual({
      weekEnding: "2026-09-10",
      ambiguous: false,
      explicitYear: true,
    });
    expect(dateFromFilename("OA-New-Members -w-e 10-09-2026.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    expect(dateFromFilename("oa - new members - we 3-1-2026.xls", ref)?.weekEnding).toBe("2026-01-03");
    expect(dateFromFilename("Unfinancial Members – w-e 10/09/2026.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    expect(dateFromFilename("OA - New Members - w-e 01-12-2026.xlsx", ref)?.weekEnding).toBe("2026-12-01");
    expect(dateFromFilename("OA Joins 10-09-26.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    expect(dateFromFilename("OA Joins 10092026.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    expect(dateFromFilename("OA Joins 2026-09-10.xlsx", ref)?.weekEnding).toBe("2026-09-10");
  });

  it("reads short dates and infers the year from when the file arrived", () => {
    expect(dateFromFilename("OA Joins 409.xlsx", ref)).toEqual({
      weekEnding: "2026-09-04",
      ambiguous: false,
      explicitYear: false,
    });
    expect(dateFromFilename("OA Joins 1009.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    expect(dateFromFilename("OA Joins 10-9.xlsx", ref)?.weekEnding).toBe("2026-09-10");
    // A December file received in January belongs to the year before.
    expect(dateFromFilename("OA Joins 2912.xlsx", new Date("2027-01-02T00:00:00Z"))?.weekEnding).toBe(
      "2026-12-29"
    );
  });

  it("settles a three-digit date only when one reading is near the arrival date", () => {
    // "111" is 1 Nov or 11 Jan.
    expect(dateFromFilename("OA Joins 111.xlsx", new Date("2026-11-03T00:00:00Z"))).toEqual({
      weekEnding: "2026-11-01",
      ambiguous: false,
      explicitYear: false,
    });
    expect(dateFromFilename("OA Joins 111.xlsx", new Date("2027-01-13T00:00:00Z"))?.weekEnding).toBe(
      "2027-01-11"
    );
    // Arriving in March, neither reading is near: hold it.
    expect(dateFromFilename("OA Joins 111.xlsx", new Date("2027-03-01T00:00:00Z"))?.ambiguous).toBe(true);
  });

  it("rejects impossible or missing dates", () => {
    expect(dateFromFilename("OA - New Members - w-e 31-02-2026.xlsx", ref)).toBeNull();
    expect(dateFromFilename("OA Joins.xlsx", ref)).toBeNull();
    expect(dateFromFilename("OA Joins 4099.xlsx", ref)).toBeNull();
  });
});

describe("classifyWeeklyFile", () => {
  it("reads the kind from the columns and the week from the name", () => {
    const c = classifyWeeklyFile("OA - New Members - w-e 10-09-2026.xlsx", NEW, ARRIVED);
    expect(c).toMatchObject({ isWeeklyFile: true, kind: "new", weekEnding: "2026-09-10", needsReview: false });
    expect(c.signals.latestRowDate).toBe("2026-09-10");
    expect(c.signals.rowCount).toBe(2);
  });

  it("classifies each layout whatever the file is called", () => {
    expect(classifyWeeklyFile("OA Joins 1009.xlsx", NEW, ARRIVED).kind).toBe("new");
    expect(classifyWeeklyFile("weekly 1009.xlsx", RESIGNED, ARRIVED).kind).toBe("resigned");
    expect(classifyWeeklyFile("weekly 1009.xlsx", RECOMMENCED, ARRIVED).kind).toBe("recommenced");
    expect(classifyWeeklyFile("weekly 1009.xlsx", UNFINANCIAL, ARRIVED).kind).toBe("unfinancial");
  });

  it("holds a file whose name contradicts its columns", () => {
    const c = classifyWeeklyFile("OA - Resigned Members - w-e 10-09-2026.xlsx", NEW, ARRIVED);
    expect(c.kind).toBe("new");
    expect(c.needsReview).toBe(true);
    expect(c.issues[0]).toMatch(/Named as Resigned Members but the columns are the New Members layout/);
  });

  it("uses the name to split the shared recommenced/unfinancial layout", () => {
    expect(
      classifyWeeklyFile("OA Unfinancials 1009.xlsx", SHARED_LAYOUT_EMPTY, ARRIVED)
    ).toMatchObject({ kind: "unfinancial", needsReview: false });
    const unclear = classifyWeeklyFile("OA weekly 1009.xlsx", SHARED_LAYOUT_EMPTY, ARRIVED);
    expect(unclear.needsReview).toBe(true);
    expect(unclear.issues[0]).toMatch(/Recommenced Members or Unfinancial Members/);
  });

  it("holds a file with no date in the name", () => {
    const c = classifyWeeklyFile("OA Joins.xlsx", NEW, ARRIVED);
    expect(c).toMatchObject({ kind: "new", weekEnding: null, needsReview: true });
  });

  it("holds a file whose rows run past the week in its name", () => {
    const c = classifyWeeklyFile("OA Joins 409.xlsx", NEW, ARRIVED);
    expect(c.weekEnding).toBe("2026-09-04");
    expect(c.needsReview).toBe(true);
    expect(c.issues.join()).toMatch(/Row dates run to 10\/09\/2026, after the week ending 04\/09\/2026/);
  });

  it("holds a name-only match whose columns are not a weekly layout", () => {
    const c = classifyWeeklyFile("OA - New Members - w-e 10-09-2026.xlsx", UNRELATED, ARRIVED);
    expect(c).toMatchObject({ isWeeklyFile: true, kind: "new", needsReview: true });
  });

  it("ignores spreadsheets that are not weekly files", () => {
    expect(classifyWeeklyFile("New worksite list.xlsx", UNRELATED, ARRIVED).isWeeklyFile).toBe(false);
    expect(classifyWeeklyFile("Full member list 1709.xlsx", UNRELATED, ARRIVED).isWeeklyFile).toBe(false);
    expect(classifyWeeklyFile("broken.xlsx", Buffer.from("not a workbook"), ARRIVED).isWeeklyFile).toBe(false);
  });
});

describe("resolveWeeklyFileGroup", () => {
  const classify = (name: string, buffer: Buffer) => classifyWeeklyFile(name, buffer, ARRIVED);

  it("gives a dateless file the week of the files sent with it", () => {
    const [joins, rejoins, resigned, unfinancial] = resolveWeeklyFileGroup([
      classify("OA Joins 1009.xlsx", NEW),
      classify("rejoins.xlsx", RECOMMENCED),
      classify("OA-Resigned-Members -w-e 10-09-2026.xlsx", RESIGNED),
      classify("Unfinancials 10-09.xlsx", UNFINANCIAL),
    ]);
    for (const c of [joins, rejoins, resigned, unfinancial]) {
      expect(c.weekEnding).toBe("2026-09-10");
      expect(c.needsReview).toBe(false);
    }
    expect(rejoins.notes).toContain("Week ending 10/09/2026: from the other files sent with it");
  });

  it("holds a file whose date disagrees with the rest of the set", () => {
    const group = resolveWeeklyFileGroup([
      classify("OA - New Members - w-e 10-09-2026.xlsx", NEW),
      classify("OA - Resigned Members - w-e 10-09-2026.xlsx", RESIGNED),
      classify("OA - Unfinancial Members - w-e 11-09-2026.xlsx", UNFINANCIAL),
    ]);
    expect(group.map((c) => c.needsReview)).toEqual([false, false, true]);
    expect(group[2].issues.join()).toMatch(/files sent with it are 10\/09\/2026/);
  });

  it("holds both files when two of the same kind arrive together", () => {
    const group = resolveWeeklyFileGroup([
      classify("OA Joins 1009.xlsx", NEW),
      classify("OA New Members 1009 (1).xlsx", NEW),
    ]);
    expect(group.every((c) => c.needsReview)).toBe(true);
  });

  it("leaves unrelated attachments alone", () => {
    const [unrelated] = resolveWeeklyFileGroup([
      classify("New worksite list.xlsx", UNRELATED),
      classify("OA Joins 1009.xlsx", NEW),
    ]);
    expect(unrelated.isWeeklyFile).toBe(false);
    expect(unrelated.needsReview).toBe(false);
  });
});
