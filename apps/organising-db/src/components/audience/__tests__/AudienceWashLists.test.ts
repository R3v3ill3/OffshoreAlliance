import { describe, expect, it } from "vitest";
import {
  idsExcludedByWash,
  washListKey,
  type WashListOverlap,
} from "@/components/audience/AudienceWashLists";

describe("idsExcludedByWash", () => {
  const lists: WashListOverlap[] = [
    {
      list_id: 1,
      name: "Delegates",
      kind: "worker_list",
      overlap_ids: [10, 11],
    },
    {
      list_id: 2,
      name: "August blast",
      kind: "sms_list",
      overlap_ids: [11, 12],
    },
  ];

  it("excludes only ids from selected lists", () => {
    const selected = new Set([washListKey(lists[0])]);
    expect([...idsExcludedByWash(lists, selected)].sort()).toEqual([10, 11]);
  });

  it("unions overlaps when multiple lists are selected", () => {
    const selected = new Set(lists.map(washListKey));
    expect([...idsExcludedByWash(lists, selected)].sort()).toEqual([10, 11, 12]);
  });

  it("excludes nothing when no lists are ticked", () => {
    expect(idsExcludedByWash(lists, new Set()).size).toBe(0);
  });
});
