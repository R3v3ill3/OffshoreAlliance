import { describe, expect, it } from "vitest";
import {
  computeNetMovement,
  defaultActionForUnmatched,
  formatWeekEnding,
  membershipUpdateStoragePath,
  parseMembershipUpdateFilename,
} from "../kinds";

describe("parseMembershipUpdateFilename", () => {
  it("parses the four real file names", () => {
    expect(parseMembershipUpdateFilename("OA - New Members - w-e 10-09-2026.xlsx")).toEqual({
      kind: "new",
      weekEnding: "2026-09-10",
    });
    expect(
      parseMembershipUpdateFilename("OA - Recommenced Members - w-e 10-09-2026.xlsx")
    ).toEqual({ kind: "recommenced", weekEnding: "2026-09-10" });
    expect(parseMembershipUpdateFilename("OA - Resigned Members - w-e 10-09-2026.xlsx")).toEqual({
      kind: "resigned",
      weekEnding: "2026-09-10",
    });
    expect(
      parseMembershipUpdateFilename("OA - Unfinancial Members - w-e 10-09-2026.xlsx")
    ).toEqual({ kind: "unfinancial", weekEnding: "2026-09-10" });
  });

  it("tolerates the variations an email client or exporter introduces", () => {
    expect(parseMembershipUpdateFilename("OA_-_New_Members_-_w-e_10-09-2026.xlsx")).toEqual({
      kind: "new",
      weekEnding: "2026-09-10",
    });
    expect(parseMembershipUpdateFilename("oa - new members - we 3-1-2026.xls")).toEqual({
      kind: "new",
      weekEnding: "2026-01-03",
    });
    expect(parseMembershipUpdateFilename("Unfinancial Members – w-e 10/09/2026.xlsx")).toEqual({
      kind: "unfinancial",
      weekEnding: "2026-09-10",
    });
    expect(parseMembershipUpdateFilename("attachments/OA - Resigned Members - w-e 10-09-2026.xlsx")).toEqual({
      kind: "resigned",
      weekEnding: "2026-09-10",
    });
  });

  it("reads the date day-first", () => {
    expect(parseMembershipUpdateFilename("OA - New Members - w-e 01-12-2026.xlsx")?.weekEnding).toBe(
      "2026-12-01"
    );
  });

  it("rejects anything that is not one of the four files or has a bad date", () => {
    expect(parseMembershipUpdateFilename("Full member list 1709.xlsx")).toBeNull();
    expect(parseMembershipUpdateFilename("OA - Active Members - w-e 10-09-2026.xlsx")).toBeNull();
    expect(parseMembershipUpdateFilename("OA - New Members - w-e 31-02-2026.xlsx")).toBeNull();
    expect(parseMembershipUpdateFilename("OA - New Members - w-e 10-09-2026.pdf")).toBeNull();
    expect(parseMembershipUpdateFilename("")).toBeNull();
  });
});

describe("computeNetMovement", () => {
  it("is (new + recommenced) - (resigned + unfinancial)", () => {
    expect(computeNetMovement({ new: 15, recommenced: 9, resigned: 6, unfinancial: 17 })).toBe(1);
    expect(computeNetMovement({ new: 0, recommenced: 0, resigned: 3, unfinancial: 2 })).toBe(-5);
  });
});

describe("defaults", () => {
  it("creates unmatched new members and skips unmatched rows from the other files", () => {
    expect(defaultActionForUnmatched("new")).toBe("create");
    expect(defaultActionForUnmatched("recommenced")).toBe("skip");
    expect(defaultActionForUnmatched("resigned")).toBe("skip");
    expect(defaultActionForUnmatched("unfinancial")).toBe("skip");
  });

  it("formats and paths", () => {
    expect(formatWeekEnding("2026-09-10")).toBe("10/09/2026");
    expect(membershipUpdateStoragePath("2026-09-10", "resigned")).toBe("2026-09-10/resigned.xlsx");
  });
});
