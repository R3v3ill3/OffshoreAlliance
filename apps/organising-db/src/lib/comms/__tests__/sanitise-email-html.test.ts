import { describe, expect, it } from "vitest";
import { stripImportedEmailSignatureBlocks } from "@/lib/comms/sanitise-email-html";

describe("stripImportedEmailSignatureBlocks", () => {
  it("removes trailing literal HTML image signatures from template text", () => {
    const result = stripImportedEmailSignatureBlocks({
      bodyText: [
        "Dear {{first_name}},",
        "",
        "This is the actual campaign update.",
        "",
        '<div style="font-family:Arial">',
        '<p>Kind regards</p>',
        '<img src="cid:oa-logo" alt="Offshore Alliance logo" width="400">',
        "</div>",
      ].join("\n"),
    });

    expect(result.bodyText).toBe("Dear {{first_name}},\n\nThis is the actual campaign update.");
  });

  it("removes encoded HTML image blocks from template text", () => {
    const result = stripImportedEmailSignatureBlocks({
      bodyText: [
        "Please attend the meeting tomorrow.",
        "",
        "&lt;table&gt;",
        "&lt;tr&gt;&lt;td&gt;",
        '&lt;img src="https://example.test/banner.png" alt="signature banner"&gt;',
        "&lt;/td&gt;&lt;/tr&gt;",
        "&lt;/table&gt;",
      ].join("\n"),
    });

    expect(result.bodyText).toBe("Please attend the meeting tomorrow.");
  });

  it("leaves ordinary template text alone", () => {
    const bodyText = "Dear {{first_name}},\n\nStand together and vote yes.";

    const result = stripImportedEmailSignatureBlocks({ bodyText });

    expect(result.bodyText).toBe(bodyText);
  });

  it("removes trailing image signature HTML from rich template bodies", () => {
    const result = stripImportedEmailSignatureBlocks({
      bodyText: "Campaign body",
      bodyHtml:
        '<p>Campaign body</p><div style="margin-top:32px"><p>Join the Offshore Alliance</p><img src="/email-assets/logo.png" alt="OA logo"></div>',
    });

    expect(result.bodyHtml).toBe("<p>Campaign body</p>");
  });
});
