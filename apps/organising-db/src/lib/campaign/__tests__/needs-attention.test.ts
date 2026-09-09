import { describe, expect, it } from "vitest";
import {
  buildNeedsAttention,
  pendingReviewHref,
  roleCheckHref,
  type NeedsAttentionInput,
} from "../needs-attention";

const CAMPAIGNS = [
  { campaign_id: 1, name: "Bravo" },
  { campaign_id: 2, name: "Alpha" },
];

function build(overrides: Partial<NeedsAttentionInput>) {
  return buildNeedsAttention({
    campaigns: CAMPAIGNS,
    pendingReview: [],
    roleCheckCounts: new Map(),
    phoneActions: [],
    emailDrafts: [],
    ...overrides,
  });
}

describe("buildNeedsAttention", () => {
  it("N1 pending-review rows group to one item per campaign with a count and plural label", () => {
    const items = build({
      pendingReview: [{ campaign_id: 1 }, { campaign_id: 1 }, { campaign_id: 2 }],
    });
    expect(items.map((i) => [i.kind, i.campaignId, i.count, i.label, i.href])).toEqual([
      ["pending_review", 2, 1, "1 person to review", "/campaigns/2?tab=plan&sub=pending-review"],
      ["pending_review", 1, 2, "2 people to review", "/campaigns/1?tab=plan&sub=pending-review"],
    ]);
    expect(pendingReviewHref(2)).toBe("/campaigns/2?tab=plan&sub=pending-review");
  });

  it("N2 a role-check count of 0 or undefined produces no item; > 0 links to the role-check sub-tab", () => {
    expect(build({ roleCheckCounts: new Map([[1, 0]]) })).toEqual([]);
    const items = build({ roleCheckCounts: new Map([[1, 3], [2, 1]]) });
    expect(items.map((i) => [i.kind, i.campaignId, i.count, i.label, i.href])).toEqual([
      ["role_check", 2, 1, "1 leader to check", "/campaigns/2?tab=plan&sub=role-check"],
      ["role_check", 1, 3, "3 leaders to check", "/campaigns/1?tab=plan&sub=role-check"],
    ]);
    expect(roleCheckHref(1)).toBe("/campaigns/1?tab=plan&sub=role-check");
  });

  it("N3 one phone item per in-progress action, linked by phoneResumeHref", () => {
    const items = build({
      phoneActions: [
        { campaign_id: 1, action_id: 10, entry_branch: "list_first", script_id: null, list_ids: null },
        { campaign_id: 1, action_id: 11, entry_branch: "script_first", script_id: 4, list_ids: null },
      ],
    });
    expect(items.map((i) => [i.kind, i.label, i.href])).toEqual([
      ["phone_resume", "Finish the call action you started", "/campaigns/1/phone/lists/new?action_id=10"],
      [
        "phone_resume",
        "Finish the call action you started",
        "/campaigns/phone-wizard?campaign_id=1&action_id=11&script_id=4",
      ],
    ]);
    expect(items.every((i) => i.count === undefined)).toBe(true);
  });

  it("N4 one email item per draft, subject appended only when non-empty", () => {
    const items = build({
      emailDrafts: [
        { campaign_id: 2, draft_id: 20, entry_branch: "ai_first", email_list_id: null, subject: "Rally" },
        { campaign_id: 2, draft_id: 21, entry_branch: "build_list", email_list_id: 3, subject: "  " },
        { campaign_id: 2, draft_id: 22, entry_branch: null, email_list_id: null, subject: null },
      ],
    });
    expect(items.map((i) => [i.label, i.href])).toEqual([
      ['Finish the email you started — "Rally"', "/campaigns/2/email/wizard?draft_id=20&entry_branch=ai_first"],
      ["Finish the email you started", "/campaigns/2/email/wizard?draft_id=21&entry_branch=build_list"],
      ["Finish the email you started", "/campaigns/2"],
    ]);
  });

  it("N5 rows for a campaign not in `campaigns` are dropped, every source", () => {
    const items = build({
      pendingReview: [{ campaign_id: 99 }],
      roleCheckCounts: new Map([[99, 5]]),
      phoneActions: [{ campaign_id: 99, action_id: 1, entry_branch: null, script_id: null, list_ids: null }],
      emailDrafts: [{ campaign_id: 99, draft_id: 1, entry_branch: null, email_list_id: null, subject: null }],
    });
    expect(items).toEqual([]);
  });

  it("N6 order: phone, email, pending review, role check; by campaign name within a kind", () => {
    const items = build({
      pendingReview: [{ campaign_id: 1 }, { campaign_id: 2 }],
      roleCheckCounts: new Map([[1, 1], [2, 1]]),
      phoneActions: [
        { campaign_id: 1, action_id: 1, entry_branch: null, script_id: null, list_ids: null },
        { campaign_id: 2, action_id: 2, entry_branch: null, script_id: null, list_ids: null },
      ],
      emailDrafts: [
        { campaign_id: 1, draft_id: 1, entry_branch: null, email_list_id: null, subject: null },
        { campaign_id: 2, draft_id: 2, entry_branch: null, email_list_id: null, subject: null },
      ],
    });
    expect(items.map((i) => `${i.kind}:${i.campaignName}`)).toEqual([
      "phone_resume:Alpha",
      "phone_resume:Bravo",
      "email_resume:Alpha",
      "email_resume:Bravo",
      "pending_review:Alpha",
      "pending_review:Bravo",
      "role_check:Alpha",
      "role_check:Bravo",
    ]);
  });

  it("N6 is deterministic as role-check probes land: earlier items keep their positions", () => {
    const before = build({ pendingReview: [{ campaign_id: 1 }] });
    const after = build({ pendingReview: [{ campaign_id: 1 }], roleCheckCounts: new Map([[2, 2]]) });
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it("N7 no sources → an empty list (the section is not rendered)", () => {
    expect(build({})).toEqual([]);
  });

  it("N8 keys are `${kind}:${campaignId}:${id ?? ''}` and unique", () => {
    const items = build({
      pendingReview: [{ campaign_id: 1 }],
      roleCheckCounts: new Map([[1, 1]]),
      phoneActions: [{ campaign_id: 1, action_id: 10, entry_branch: null, script_id: null, list_ids: null }],
      emailDrafts: [{ campaign_id: 1, draft_id: 20, entry_branch: null, email_list_id: null, subject: null }],
    });
    expect(items.map((i) => i.key)).toEqual([
      "phone_resume:1:10",
      "email_resume:1:20",
      "pending_review:1:",
      "role_check:1:",
    ]);
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
  });
});
