import { describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_PROTECTED_WORKER_FIELDS,
  describeProtectedFields,
  loadCampaignProtectedWorkerIds,
  stripCampaignProtectedFields,
} from "../campaign-protected-fields";
import { IN_FILTER_CHUNK } from "@/lib/supabase/chunk-in-filter";

describe("stripCampaignProtectedFields", () => {
  const patch = {
    first_name: "Pat",
    employer_id: 10,
    worksite_id: 20,
    canonical_occupation_id: 30,
    union_membership_type_id: 3,
  };

  it("returns the patch untouched when the worker is not in a campaign", () => {
    const res = stripCampaignProtectedFields(patch, false);
    expect(res.patch).toEqual(patch);
    expect(res.protectedFields).toEqual([]);
  });

  it("drops employer, worksite and occupation but keeps everything else", () => {
    const res = stripCampaignProtectedFields(patch, true);
    expect(res.patch).toEqual({ first_name: "Pat", union_membership_type_id: 3 });
    expect(res.protectedFields).toEqual([...CAMPAIGN_PROTECTED_WORKER_FIELDS]);
  });

  it("drops an explicit null too (an import clearing the field is still an overwrite)", () => {
    const res = stripCampaignProtectedFields({ employer_id: null, notes: "x" }, true);
    expect(res.patch).toEqual({ notes: "x" });
    expect(res.protectedFields).toEqual(["employer_id"]);
  });

  it("does not report a field the patch never carried", () => {
    const res = stripCampaignProtectedFields({ worksite_id: 5 }, true);
    expect(res.protectedFields).toEqual(["worksite_id"]);
  });

  it("does not mutate the input", () => {
    const input = { employer_id: 1 };
    stripCampaignProtectedFields(input, true);
    expect(input).toEqual({ employer_id: 1 });
  });
});

describe("describeProtectedFields", () => {
  it("formats one, two and three fields", () => {
    expect(describeProtectedFields([])).toBe("");
    expect(describeProtectedFields(["employer_id"])).toBe("employer kept from campaign");
    expect(describeProtectedFields(["employer_id", "worksite_id"])).toBe(
      "employer and worksite kept from campaign"
    );
    expect(
      describeProtectedFields(["employer_id", "worksite_id", "canonical_occupation_id"])
    ).toBe("employer, worksite and job title kept from campaign");
  });
});

type Call = { table: string; inWorkerIds: number[]; statuses: string[] | null; smsFilter: unknown };

function fakeClient(rowsByWorker: Record<number, true>, failOnChunk: number | null = null) {
  const calls: Call[] = [];
  let chunkIdx = 0;
  const client = {
    from(table: string) {
      const call: Call = { table, inWorkerIds: [], statuses: null, smsFilter: undefined };
      calls.push(call);
      const builder = {
        select() {
          return builder;
        },
        in(column: string, values: unknown[]) {
          if (column === "worker_id") call.inWorkerIds = values as number[];
          if (column === "campaign.status") call.statuses = values as string[];
          return builder;
        },
        eq(column: string, value: unknown) {
          if (column === "campaign.is_sms_episode") call.smsFilter = value;
          return builder;
        },
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          const idx = chunkIdx++;
          if (failOnChunk === idx) {
            resolve({ data: null, error: { message: "boom" } });
            return;
          }
          const data = call.inWorkerIds
            .filter((id) => rowsByWorker[id])
            .map((worker_id) => ({ worker_id }));
          void reject;
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe("loadCampaignProtectedWorkerIds", () => {
  it("returns an empty set without querying when there are no ids", async () => {
    const { client, calls } = fakeClient({});
    expect(await loadCampaignProtectedWorkerIds(client, [])).toEqual(new Set());
    expect(calls).toHaveLength(0);
  });

  it("returns only the workers that have a protecting membership row", async () => {
    const { client, calls } = fakeClient({ 2: true, 5: true });
    const res = await loadCampaignProtectedWorkerIds(client, [1, 2, 3, 5, 5]);
    expect(res).toEqual(new Set([2, 5]));
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("campaign_worker_membership");
    expect(calls[0].inWorkerIds).toEqual([1, 2, 3, 5]);
    expect(calls[0].smsFilter).toBe(false);
    expect(calls[0].statuses).toEqual(["planning", "active", "suspended"]);
  });

  it("batches the lookup so a large import stays under URL and max-rows limits", async () => {
    const ids = Array.from({ length: IN_FILTER_CHUNK * 2 + 7 }, (_, i) => i + 1);
    const { client, calls } = fakeClient({ 1: true, [ids.length]: true });
    const res = await loadCampaignProtectedWorkerIds(client, ids);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.inWorkerIds.length)).toEqual([IN_FILTER_CHUNK, IN_FILTER_CHUNK, 7]);
    expect(res).toEqual(new Set([1, ids.length]));
  });

  it("throws on a read error instead of treating everyone as unprotected", async () => {
    const { client } = fakeClient({ 1: true }, 0);
    await expect(loadCampaignProtectedWorkerIds(client, [1])).rejects.toThrow(
      /campaign membership for protection: boom/
    );
  });

  it("drops non-positive and non-finite ids before querying", async () => {
    const { client, calls } = fakeClient({});
    await loadCampaignProtectedWorkerIds(client, [0, -1, Number.NaN, 4]);
    expect(calls[0].inWorkerIds).toEqual([4]);
    vi.restoreAllMocks();
  });
});
