import { describe, expect, it } from "vitest";
import {
  pruneSelectedAssessmentIds,
  resolveAssessmentTarget,
  type AssessmentTargetInput,
} from "../chat-assessment-target";

function input(
  overrides: Partial<AssessmentTargetInput> = {},
): AssessmentTargetInput {
  return {
    conversationCampaignId: 42,
    conversationCampaignIsEpisode: false,
    boardAssessmentCampaignId: null,
    workerId: 7,
    ...overrides,
  };
}

describe("resolveAssessmentTarget", () => {
  it("uses the conversation's campaign for an ordinary campaign chat", () => {
    expect(resolveAssessmentTarget(input())).toEqual({
      state: "ready",
      campaignId: 42,
    });
  });

  it("needs a worker before anything else", () => {
    expect(resolveAssessmentTarget(input({ workerId: null }))).toEqual({
      state: "needs_worker",
    });
  });

  it("needs a worker even when a campaign is nominated", () => {
    expect(
      resolveAssessmentTarget(
        input({ workerId: null, boardAssessmentCampaignId: 9 }),
      ),
    ).toEqual({ state: "needs_worker" });
  });

  it("needs a campaign for an unattached thread", () => {
    expect(
      resolveAssessmentTarget(input({ conversationCampaignId: null })),
    ).toEqual({ state: "needs_campaign" });
  });

  it("needs a real campaign for an episode chat with no nomination", () => {
    expect(
      resolveAssessmentTarget(
        input({ conversationCampaignId: 900, conversationCampaignIsEpisode: true }),
      ),
    ).toEqual({ state: "needs_real_campaign" });
  });

  it("uses the nomination once an episode chat has one", () => {
    expect(
      resolveAssessmentTarget(
        input({
          conversationCampaignId: 900,
          conversationCampaignIsEpisode: true,
          boardAssessmentCampaignId: 42,
        }),
      ),
    ).toEqual({ state: "ready", campaignId: 42 });
  });

  it("lets a nomination override an ordinary campaign chat", () => {
    expect(
      resolveAssessmentTarget(input({ boardAssessmentCampaignId: 99 })),
    ).toEqual({ state: "ready", campaignId: 99 });
  });

  it("uses the nomination even with no conversation campaign", () => {
    expect(
      resolveAssessmentTarget(
        input({ conversationCampaignId: null, boardAssessmentCampaignId: 99 }),
      ),
    ).toEqual({ state: "ready", campaignId: 99 });
  });
});

describe("pruneSelectedAssessmentIds", () => {
  it("keeps live ids in their original order", () => {
    expect(pruneSelectedAssessmentIds([3, 1, 2], [1, 2, 3])).toEqual([3, 1, 2]);
  });

  it("drops ids whose activity no longer exists", () => {
    expect(pruneSelectedAssessmentIds([3, 1, 2], [1, 3])).toEqual([3, 1]);
  });

  it("drops duplicates", () => {
    expect(pruneSelectedAssessmentIds([1, 1, 2], [1, 2])).toEqual([1, 2]);
  });

  it("returns empty rather than throwing when everything is stale", () => {
    expect(pruneSelectedAssessmentIds([1, 2], [])).toEqual([]);
  });

  it("handles an empty selection", () => {
    expect(pruneSelectedAssessmentIds([], [1, 2])).toEqual([]);
  });
});
