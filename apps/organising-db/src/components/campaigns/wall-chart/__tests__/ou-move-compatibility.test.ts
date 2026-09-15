import { describe, expect, it } from "vitest";

import {
  isAllowedMoveTarget,
  isAncestorOf,
  isCrossDimensionMoveBlocked,
  isNestedOuRelationship,
} from "../ou-move-compatibility";

/** Employer 10 → worksite children 11/12; unrelated worksite 20. */
const PARENT_BY_OU = new Map<number, number | null>([
  [10, null],
  [11, 10],
  [12, 10],
  [13, 12],
  [20, null],
]);

const OU_TYPE_BY_ID = new Map<number, string>([
  [10, "employer"],
  [11, "worksite"],
  [12, "worksite"],
  [13, "worksite"],
  [20, "worksite"],
]);

describe("isAncestorOf", () => {
  it("recognises direct and nested ancestors", () => {
    expect(isAncestorOf(10, 11, PARENT_BY_OU)).toBe(true);
    expect(isAncestorOf(10, 13, PARENT_BY_OU)).toBe(true);
    expect(isAncestorOf(12, 13, PARENT_BY_OU)).toBe(true);
  });

  it("rejects siblings, reverse links, and unrelated units", () => {
    expect(isAncestorOf(11, 10, PARENT_BY_OU)).toBe(false);
    expect(isAncestorOf(11, 12, PARENT_BY_OU)).toBe(false);
    expect(isAncestorOf(10, 20, PARENT_BY_OU)).toBe(false);
  });
});

describe("isNestedOuRelationship", () => {
  it("is true either direction along a parent chain", () => {
    expect(isNestedOuRelationship(10, 11, PARENT_BY_OU)).toBe(true);
    expect(isNestedOuRelationship(11, 10, PARENT_BY_OU)).toBe(true);
    expect(isNestedOuRelationship(10, 13, PARENT_BY_OU)).toBe(true);
  });

  it("is false for siblings and unrelated units", () => {
    expect(isNestedOuRelationship(11, 12, PARENT_BY_OU)).toBe(false);
    expect(isNestedOuRelationship(10, 20, PARENT_BY_OU)).toBe(false);
    expect(isNestedOuRelationship(10, 10, PARENT_BY_OU)).toBe(false);
  });
});

describe("isCrossDimensionMoveBlocked", () => {
  it("allows employer-container → nested worksite sub-unit (campaign-64 shape)", () => {
    expect(
      isCrossDimensionMoveBlocked({
        mode: "move",
        targetOuId: 11,
        refs: [{ fromOuId: 10, fromOuType: "employer" }],
        ouTypeById: OU_TYPE_BY_ID,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(false);
  });

  it("blocks unrelated worksite → employer moves", () => {
    expect(
      isCrossDimensionMoveBlocked({
        mode: "move",
        targetOuId: 10,
        refs: [{ fromOuId: 20, fromOuType: "worksite" }],
        ouTypeById: OU_TYPE_BY_ID,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(true);
  });

  it("allows same-type moves and copy across types", () => {
    expect(
      isCrossDimensionMoveBlocked({
        mode: "move",
        targetOuId: 12,
        refs: [{ fromOuId: 11, fromOuType: "worksite" }],
        ouTypeById: OU_TYPE_BY_ID,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(false);
    expect(
      isCrossDimensionMoveBlocked({
        mode: "copy",
        targetOuId: 10,
        refs: [{ fromOuId: 20, fromOuType: "worksite" }],
        ouTypeById: OU_TYPE_BY_ID,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(false);
  });

  it("allows nested worksite → employer-parent moves", () => {
    expect(
      isCrossDimensionMoveBlocked({
        mode: "move",
        targetOuId: 10,
        refs: [{ fromOuId: 11, fromOuType: "worksite" }],
        ouTypeById: OU_TYPE_BY_ID,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(false);
  });
});

describe("isAllowedMoveTarget", () => {
  const sourceOuIds = new Set([10]);

  it("includes same-type units and nested descendants", () => {
    expect(
      isAllowedMoveTarget({
        target: { ou_id: 99, ou_type: "employer" },
        sourceDimensionType: "employer",
        sourceOuIds,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(true);
    expect(
      isAllowedMoveTarget({
        target: { ou_id: 11, ou_type: "worksite" },
        sourceDimensionType: "employer",
        sourceOuIds,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(true);
    expect(
      isAllowedMoveTarget({
        target: { ou_id: 13, ou_type: "worksite" },
        sourceDimensionType: "employer",
        sourceOuIds,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(true);
  });

  it("excludes unrelated other-dimension units", () => {
    expect(
      isAllowedMoveTarget({
        target: { ou_id: 20, ou_type: "worksite" },
        sourceDimensionType: "employer",
        sourceOuIds,
        parentByOu: PARENT_BY_OU,
      })
    ).toBe(false);
  });
});
