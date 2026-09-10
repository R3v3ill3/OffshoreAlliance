import { describe, expect, it } from "vitest";
import { emailResumeHref, phoneResumeHref, type EmailResumeRow, type PhoneResumeRow } from "../resume-links";

// Expected strings are the URLs the banners emitted before the switches were
// extracted (ResumeBanner.tsx:81-116, EmailResumeBanner.tsx:104-128).

function phone(overrides: Partial<PhoneResumeRow>): PhoneResumeRow {
  return {
    campaign_id: 5,
    action_id: 77,
    entry_branch: null,
    script_id: null,
    list_ids: null,
    ...overrides,
  };
}

function email(overrides: Partial<EmailResumeRow>): EmailResumeRow {
  return { campaign_id: 5, draft_id: 33, entry_branch: null, email_list_id: null, ...overrides };
}

describe("phoneResumeHref", () => {
  it("script_first with a script", () => {
    expect(phoneResumeHref(phone({ entry_branch: "script_first", script_id: 9 }))).toBe(
      "/campaigns/phone-wizard?campaign_id=5&action_id=77&script_id=9"
    );
  });

  it("script_first without a script", () => {
    expect(phoneResumeHref(phone({ entry_branch: "script_first" }))).toBe(
      "/campaigns/phone-wizard?campaign_id=5&action_id=77"
    );
  });

  it("list_first", () => {
    expect(phoneResumeHref(phone({ entry_branch: "list_first" }))).toBe(
      "/campaigns/5/phone/lists/new?action_id=77"
    );
  });

  it("assessment_first", () => {
    expect(phoneResumeHref(phone({ entry_branch: "assessment_first" }))).toBe(
      "/campaigns/5/phone/assessment-setup?action_id=77"
    );
  });

  it("assessment_list_first", () => {
    expect(phoneResumeHref(phone({ entry_branch: "assessment_list_first" }))).toBe(
      "/campaigns/5/phone/lists/new?action_id=77&pathway=assessment_only"
    );
  });

  it("build_list with a linked list", () => {
    expect(phoneResumeHref(phone({ entry_branch: "build_list", list_ids: [12, 13] }))).toBe(
      "/campaigns/5/phone/lists/12?action_id=77"
    );
  });

  it("build_list with no list falls back to the Phone tab", () => {
    expect(phoneResumeHref(phone({ entry_branch: "build_list", list_ids: [] }))).toBe(
      "/campaigns/5/phone"
    );
    expect(phoneResumeHref(phone({ entry_branch: "build_list", list_ids: null }))).toBe(
      "/campaigns/5/phone"
    );
  });

  it("unknown or null branch falls back to the Phone tab", () => {
    expect(phoneResumeHref(phone({ entry_branch: null }))).toBe("/campaigns/5/phone");
  });
});

describe("emailResumeHref", () => {
  it("ai_first / paste_first → the wizard", () => {
    expect(emailResumeHref(email({ entry_branch: "ai_first" }))).toBe(
      "/campaigns/5/email/wizard?draft_id=33&entry_branch=ai_first"
    );
    expect(emailResumeHref(email({ entry_branch: "paste_first" }))).toBe(
      "/campaigns/5/email/wizard?draft_id=33&entry_branch=paste_first"
    );
  });

  it("ai_list_first / paste_list_first with no list → lists/new", () => {
    expect(emailResumeHref(email({ entry_branch: "ai_list_first" }))).toBe(
      "/campaigns/5/email/lists/new?draft_id=33&entry_branch=ai_list_first"
    );
    expect(emailResumeHref(email({ entry_branch: "paste_list_first" }))).toBe(
      "/campaigns/5/email/lists/new?draft_id=33&entry_branch=paste_list_first"
    );
  });

  it("ai_list_first / paste_list_first with a list → the wizard", () => {
    expect(emailResumeHref(email({ entry_branch: "ai_list_first", email_list_id: 4 }))).toBe(
      "/campaigns/5/email/wizard?draft_id=33&entry_branch=ai_list_first"
    );
    expect(emailResumeHref(email({ entry_branch: "paste_list_first", email_list_id: 4 }))).toBe(
      "/campaigns/5/email/wizard?draft_id=33&entry_branch=paste_list_first"
    );
  });

  it("build_list → the wizard with entry_branch=build_list", () => {
    expect(emailResumeHref(email({ entry_branch: "build_list", email_list_id: 4 }))).toBe(
      "/campaigns/5/email/wizard?draft_id=33&entry_branch=build_list"
    );
  });

  it("unknown or null branch falls back to the campaign page", () => {
    expect(emailResumeHref(email({ entry_branch: null }))).toBe("/campaigns/5");
  });
});
