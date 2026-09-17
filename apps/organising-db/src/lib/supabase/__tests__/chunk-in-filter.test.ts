import { describe, expect, it } from "vitest";
import { chunkArray, fetchInChunks, IN_FILTER_CHUNK } from "../chunk-in-filter";

describe("chunkArray", () => {
  it("splits into fixed-size batches with a short tail", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns no batches for an empty list", () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it("defaults to IN_FILTER_CHUNK", () => {
    const items = Array.from({ length: IN_FILTER_CHUNK + 1 }, (_, i) => i);
    expect(chunkArray(items).map((c) => c.length)).toEqual([IN_FILTER_CHUNK, 1]);
  });

  it("rejects a non-positive size", () => {
    expect(() => chunkArray([1], 0)).toThrow(/positive/);
  });
});

describe("fetchInChunks", () => {
  it("dedupes the values, runs one call per batch and concatenates rows", async () => {
    const seen: string[][] = [];
    const rows = await fetchInChunks(
      ["a", "b", "a", "c", "d", "e"],
      async (chunk) => {
        seen.push(chunk);
        return { data: chunk.map((v) => ({ v })), error: null };
      },
      2
    );
    expect(seen).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(rows).toEqual([{ v: "a" }, { v: "b" }, { v: "c" }, { v: "d" }, { v: "e" }]);
  });

  it("throws on the first failed batch so a failed lookup is not read as 'no matches'", async () => {
    let n = 0;
    await expect(
      fetchInChunks(
        [1, 2, 3, 4],
        async () => {
          n++;
          return n === 2
            ? { data: null, error: { message: "414 URI too long" } }
            : { data: [], error: null };
        },
        2
      )
    ).rejects.toThrow("414 URI too long");
  });

  it("treats a null data page as empty", async () => {
    const rows = await fetchInChunks([1], async () => ({ data: null, error: null }));
    expect(rows).toEqual([]);
  });
});
