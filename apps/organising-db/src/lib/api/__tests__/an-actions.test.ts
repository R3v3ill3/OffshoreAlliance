import { describe, expect, it } from "vitest";
import { extractAnId, listAnActions, type AnActionsClient } from "../an-actions";

const RECORDS: Record<string, Record<string, unknown>[]> = {
  "/forms": [
    {
      identifiers: ["action_network:form-1"],
      title: "ROV roles — register your interest",
      browser_url: "https://actionnetwork.org/forms/rov",
      created_date: "2026-09-01T00:00:00Z",
      total_submissions: 96,
    },
    {
      _links: { self: { href: "https://actionnetwork.org/api/v2/forms/form-2" } },
      name: "Untitled by name",
      created_date: "2026-09-05T00:00:00Z",
    },
    { title: "No id at all" },
  ],
  "/surveys": [
    {
      identifiers: ["action_network:survey-1"],
      title: "Member survey",
      created_date: "2026-09-03T00:00:00Z",
      total_responses: 12,
    },
  ],
  "/petitions": [{ identifiers: ["action_network:pet-1"], title: "Petition", total_signatures: 3 }],
  "/events": [{ identifiers: ["action_network:ev-1"], title: "Event", total_accepted: 7 }],
};

function stubClient() {
  const paths: string[] = [];
  const client: AnActionsClient = {
    fetchAllRecords: async (path: string) => {
      paths.push(path);
      const records = RECORDS[path] ?? [];
      return { records, totalRecords: records.length, truncated: false };
    },
  };
  return { client, paths };
}

describe("listAnActions", () => {
  it("maps records, drops those without an id and sorts newest first", async () => {
    const { client, paths } = stubClient();
    const actions = await listAnActions(client);
    expect(paths.sort()).toEqual(["/events", "/forms", "/petitions", "/surveys"]);
    expect(actions.map((a) => a.id)).toEqual(["form-2", "survey-1", "form-1", "pet-1", "ev-1"]);
    const form = actions.find((a) => a.id === "form-1")!;
    expect(form).toEqual({
      resource_type: "form",
      id: "form-1",
      title: "ROV roles — register your interest",
      browser_url: "https://actionnetwork.org/forms/rov",
      created_date: "2026-09-01T00:00:00Z",
      total_records: 96,
    });
    expect(actions.find((a) => a.id === "form-2")!.title).toBe("Untitled by name");
    expect(actions.find((a) => a.id === "ev-1")!.total_records).toBe(7);
    // No link flags here — each route adds its own.
    expect("linked_activity_id" in form).toBe(false);
  });

  it("limits to the requested types and filters by title", async () => {
    const { client, paths } = stubClient();
    const actions = await listAnActions(client, { types: ["form", "survey"], q: "rov" });
    expect(paths.sort()).toEqual(["/forms", "/surveys"]);
    expect(actions.map((a) => a.id)).toEqual(["form-1"]);
  });

  it("extractAnId prefers the tagged identifier and falls back to the self link", () => {
    expect(extractAnId({ identifiers: ["other:x", "action_network:abc"] })).toBe("abc");
    expect(extractAnId({ _links: { self: { href: "https://a/b/c/" } } })).toBe("c");
    expect(extractAnId({})).toBeNull();
  });
});
