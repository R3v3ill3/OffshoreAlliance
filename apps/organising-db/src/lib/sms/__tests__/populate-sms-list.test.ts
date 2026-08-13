import { describe, expect, it } from "vitest";
import { isSmsApiAudience } from "../populate-sms-list";

describe("isSmsApiAudience", () => {
  it("accepts whole-campaign and worker-list audiences", () => {
    expect(isSmsApiAudience({ type: "campaign" })).toBe(true);
    expect(isSmsApiAudience({ type: "worker_list", worker_list_id: 9 })).toBe(
      true,
    );
  });

  it("rejects missing or invalid audience", () => {
    expect(isSmsApiAudience(undefined)).toBe(false);
    expect(isSmsApiAudience({ type: "worker_list" })).toBe(false);
    expect(isSmsApiAudience({ type: "composed" })).toBe(false);
  });
});
