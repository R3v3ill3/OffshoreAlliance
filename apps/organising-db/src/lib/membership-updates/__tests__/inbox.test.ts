import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES_INBOX,
  hasDedicatedMembershipInbox,
  membershipUpdateInbox,
  normaliseInboxAddress,
  recipientsIncludeInbox,
  shouldFileAsMembershipUpdate,
} from "../inbox";

describe("normaliseInboxAddress", () => {
  it("strips display names, case and mailto", () => {
    expect(normaliseInboxAddress("Membership <membership@mail.oa.uconstruct.app>")).toBe(
      "membership@mail.oa.uconstruct.app"
    );
    expect(normaliseInboxAddress("MAILTO:Templates@Mail.OA.uconstruct.app")).toBe(
      "templates@mail.oa.uconstruct.app"
    );
  });
});

describe("recipientsIncludeInbox", () => {
  it("matches any To: recipient", () => {
    expect(
      recipientsIncludeInbox(
        ["cc@example.com", "Membership <membership@mail.oa.uconstruct.app>"],
        "membership@mail.oa.uconstruct.app"
      )
    ).toBe(true);
    expect(recipientsIncludeInbox("templates@mail.oa.uconstruct.app", "membership@mail.oa.uconstruct.app")).toBe(
      false
    );
  });
});

describe("shouldFileAsMembershipUpdate", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_MEMBERSHIP_UPDATE_INBOX;
    delete process.env.MEMBERSHIP_UPDATE_INBOX;
    delete process.env.NEXT_PUBLIC_TEMPLATES_INBOX;
  });

  it("keeps filename routing while the inboxes still share templates@", () => {
    expect(membershipUpdateInbox()).toBe(DEFAULT_TEMPLATES_INBOX);
    expect(shouldFileAsMembershipUpdate(["templates@mail.oa.uconstruct.app"])).toBe(true);
  });

  it("only files mail To: the dedicated membership address", () => {
    process.env.NEXT_PUBLIC_MEMBERSHIP_UPDATE_INBOX = "membership@mail.oa.uconstruct.app";
    expect(hasDedicatedMembershipInbox()).toBe(true);
    expect(shouldFileAsMembershipUpdate(["membership@mail.oa.uconstruct.app"])).toBe(true);
    expect(shouldFileAsMembershipUpdate(["templates@mail.oa.uconstruct.app"])).toBe(false);
    expect(shouldFileAsMembershipUpdate(["Templates <templates@mail.oa.uconstruct.app>"])).toBe(false);
  });
});
