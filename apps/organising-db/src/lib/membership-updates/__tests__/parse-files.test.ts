import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildCombinedWorkbook,
  parseWeeklyUpdateFiles,
  parseWeeklyUpdateWorkbook,
} from "../parse-files";
import { readFirstSheet } from "@/lib/import/spreadsheet-rows";
import { buildMembershipRow } from "@/lib/import/membership-row-builder";

function workbook(rows: unknown[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
}

// Synthetic rows in the exact column layouts of the four weekly exports.
const NEW = workbook([
  ["Branch", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Job Title", "Email", "Phone", "Member Joining Date", "Re Joined Date", "Resignation Date"],
  ["AWU-MUA Alliance WA", "WA1000001", "Ada", "Newby", "Contractor Co: Pluto 2", "Pluto Train 2", "Rigger", "ada@example.com", "0400000001", new Date(Date.UTC(2026, 8, 9)), null, null],
  ["AWU-MUA Alliance WA", "WA1000002", "Ben", "Second", "Operator Ltd", "Barrow Island", "Scaffolder", "ben@example.com", "+61400000002", new Date(Date.UTC(2026, 8, 10)), new Date(Date.UTC(2026, 8, 4)), null],
]);

const RECOMMENCED = workbook([
  ["Member Billing Item", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Member Account Status", "Membership Type", "Phone", "Email", "Job Title", "Date", "Old Value"],
  ["AWU-MUA Alliance WA", "WA2000001", "Cal", "Return", "Marine Group : Marine Group: North West Shelf", "North West Shelf", "Active", "Financial", "0400000003", "cal@example.com", "Master", new Date(Date.UTC(2026, 8, 10, 23, 10)), "Non-Financial"],
]);

const RESIGNED = workbook([
  ["Branch", "Reference ID", "First Name", "Last Name", "Company Name", "Employee Worksite", "Joining Date", "Resignation Date", "Resignation Reason", "Email", "Phone", "Date Processed"],
  ["AWU-MUA Alliance WA", "WA3000001", "Dee", "Leaver", "Survey Co", "Offshore", new Date(Date.UTC(2026, 1, 24)), new Date(Date.UTC(2026, 7, 3)), "Moved Interstate", "dee@example.com", "+61400000004", new Date(Date.UTC(2026, 8, 9, 12, 24))],
]);

const UNFINANCIAL = workbook([
  ["Member Billing Item", "Reference ID", "First Name", "Last Name", "Employer", "Employee Worksite", "Member Account Status", "Membership Type", "Phone", "Email", "Job Title", "Date"],
  ["AWU-MUA Alliance WA", "WA4000001", "Eli", "Lapsed", "Maint Group : Maint Group: Karratha Gas Plant", "Karratha Gas Plant", "Stopped Payment", "Non-Financial", "0400000005", "eli@example.com", "Fitter", new Date(Date.UTC(2026, 8, 8, 23, 5))],
  ["AWU-MUA Alliance WA", "WA4000002", "Fay", "Suspended", "Maint Group : Maint Group: Pluto Train 1", "Pluto", "Suspended – Prospective", "Non-Financial", "+61400000006", "fay@example.com", "Scaffolder", new Date(Date.UTC(2026, 8, 7, 23, 6))],
]);

describe("parseWeeklyUpdateWorkbook", () => {
  it("reads the New Members layout with join and rejoin dates", () => {
    const { rows } = parseWeeklyUpdateWorkbook("new", NEW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceKind: "new",
      membershipTypeRaw: "New member",
      referenceId: "WA1000001",
      firstName: "Ada",
      lastName: "Newby",
      employerRaw: "Contractor Co: Pluto 2",
      worksiteRaw: "Pluto Train 2",
      jobTitleRaw: "Rigger",
      email: "ada@example.com",
      phone: "0400000001",
      joinDate: "2026-09-09",
      rejoinDate: null,
    });
    expect(rows[1].rejoinDate).toBe("2026-09-04");
    expect(rows[1].phone).toBe("0400000002");
  });

  it("reads the Recommenced layout: Date is the rejoin date and the doubled employer prefix is collapsed", () => {
    const { rows } = parseWeeklyUpdateWorkbook("recommenced", RECOMMENCED);
    expect(rows[0]).toMatchObject({
      sourceKind: "recommenced",
      membershipTypeRaw: "Recommenced member",
      employerRaw: "Marine Group: North West Shelf",
      rejoinDate: "2026-09-10",
      jobTitleRaw: "Master",
    });
  });

  it("reads the Resigned layout with Company Name, dates and reason", () => {
    const { rows } = parseWeeklyUpdateWorkbook("resigned", RESIGNED);
    expect(rows[0]).toMatchObject({
      sourceKind: "resigned",
      membershipTypeRaw: "Resigned member",
      employerRaw: "Survey Co",
      joinDate: "2026-02-24",
      resignationDate: "2026-08-03",
      resignationReason: "Moved Interstate",
      jobTitleRaw: null,
    });
  });

  it("reads the Unfinancial layout and does not treat its Date as a rejoin", () => {
    const { rows } = parseWeeklyUpdateWorkbook("unfinancial", UNFINANCIAL);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceKind: "unfinancial",
      membershipTypeRaw: "Unfinancial member",
      rejoinDate: null,
      employerRaw: "Maint Group: Karratha Gas Plant",
    });
    expect(rows[0].warnings).toEqual([]);
  });
});

describe("parseWeeklyUpdateFiles", () => {
  it("concatenates in canonical order with unique row indices and per-file counts", () => {
    const { rows, countsByKind } = parseWeeklyUpdateFiles([
      { kind: "unfinancial", buffer: UNFINANCIAL },
      { kind: "new", buffer: NEW },
      { kind: "resigned", buffer: RESIGNED },
      { kind: "recommenced", buffer: RECOMMENCED },
    ]);
    expect(countsByKind).toEqual({ new: 2, recommenced: 1, resigned: 1, unfinancial: 2 });
    expect(rows.map((r) => r.sourceKind)).toEqual([
      "new", "new", "recommenced", "resigned", "unfinancial", "unfinancial",
    ]);
    expect(rows.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("tolerates a missing file", () => {
    const { rows, countsByKind } = parseWeeklyUpdateFiles([{ kind: "new", buffer: NEW }]);
    expect(rows).toHaveLength(2);
    expect(countsByKind.resigned).toBe(0);
  });
});

describe("buildCombinedWorkbook", () => {
  it("round-trips through the weekly_update row builder with status taken from the file title", () => {
    const { rows } = parseWeeklyUpdateFiles([
      { kind: "new", buffer: NEW },
      { kind: "recommenced", buffer: RECOMMENCED },
      { kind: "resigned", buffer: RESIGNED },
      { kind: "unfinancial", buffer: UNFINANCIAL },
    ]);
    const combined = buildCombinedWorkbook(rows);
    const sheet = readFirstSheet(combined);
    expect(sheet).not.toBeNull();
    expect(sheet!.headers).toEqual([
      "Source File", "Member Status", "Reference ID", "First Name", "Last Name", "Employer",
      "Employee Worksite", "Job Title", "Email", "Phone", "Member Joining Date", "Re Joined Date",
      "Resignation Date", "Resignation Reason", "Date",
    ]);
    const rebuilt = sheet!.rows.map((raw, i) => buildMembershipRow(i, raw, "weekly_update"));
    expect(rebuilt.map((r) => r.sourceKind)).toEqual([
      "new", "new", "recommenced", "resigned", "unfinancial", "unfinancial",
    ]);
    expect(rebuilt.map((r) => r.membershipTypeRaw)).toEqual([
      "New member", "New member", "Recommenced member", "Resigned member",
      "Unfinancial member", "Unfinancial member",
    ]);
    expect(rebuilt[0].joinDate).toBe("2026-09-09");
    expect(rebuilt[2].rejoinDate).toBe("2026-09-10");
    expect(rebuilt[3]).toMatchObject({ resignationDate: "2026-08-03", resignationReason: "Moved Interstate" });
    expect(rebuilt[4].rejoinDate).toBeNull();
    expect(rebuilt[0].phone).toBe("0400000001");
  });
});
