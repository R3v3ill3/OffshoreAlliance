import type { ActionNetworkClient } from "./action-network";
import type { AnActionListItem, AnResourceType } from "@/lib/import/participation-import-shared";

/**
 * Shared Action Network action lister.
 *
 * Both the campaign participation-import wizard (`/api/campaigns/[id]/an-actions`)
 * and the survey importer (`/api/an-surveys/an-actions`) list the group's
 * forms / surveys / petitions / events and then flag "already linked" rows
 * against different tables. The AN walk + record mapping lives here; each
 * route adds its own link flags.
 */

/** Pages of 25 per action type — bounds AN round trips per request. */
export const AN_ACTIONS_MAX_PAGES_PER_TYPE = 4;

/** A listed AN action before any per-route link flagging. */
export type AnActionRecord = Omit<AnActionListItem, "linked_activity_id" | "linked_activity_title">;

export const AN_ACTION_TYPE_CONFIG: {
  type: AnResourceType;
  path: string;
  embeddedKey: string;
  countFields: string[];
}[] = [
  { type: "form", path: "/forms", embeddedKey: "osdi:forms", countFields: ["total_submissions"] },
  { type: "survey", path: "/surveys", embeddedKey: "action_network:surveys", countFields: ["total_responses"] },
  { type: "petition", path: "/petitions", embeddedKey: "osdi:petitions", countFields: ["total_signatures"] },
  { type: "event", path: "/events", embeddedKey: "osdi:events", countFields: ["total_accepted", "total_attendances"] },
];

export function extractAnId(record: Record<string, unknown>): string | null {
  const identifiers = record.identifiers as string[] | undefined;
  const tagged = identifiers?.find((i) => i.startsWith("action_network:"));
  if (tagged) return tagged.slice("action_network:".length);
  const links = record._links as Record<string, { href?: string }> | undefined;
  const self = links?.self?.href;
  if (self) return self.split("/").filter(Boolean).pop() ?? null;
  return null;
}

export interface ListAnActionsOptions {
  /** Which action types to list; defaults to all four. */
  types?: AnResourceType[];
  /** Case-insensitive title filter. */
  q?: string | null;
  maxPagesPerType?: number;
}

/** The subset of the AN client this helper needs — lets tests pass a stub. */
export type AnActionsClient = Pick<ActionNetworkClient, "fetchAllRecords">;

/**
 * Walk each requested type and return the mapped records, newest first.
 * Throws whatever the AN client throws (callers map that to 502).
 */
export async function listAnActions(
  client: AnActionsClient,
  opts: ListAnActionsOptions = {}
): Promise<AnActionRecord[]> {
  const wanted = opts.types ? new Set(opts.types) : null;
  const configs = AN_ACTION_TYPE_CONFIG.filter((c) => !wanted || wanted.has(c.type));
  const maxPages = opts.maxPagesPerType ?? AN_ACTIONS_MAX_PAGES_PER_TYPE;
  const q = (opts.q ?? "").trim().toLowerCase();

  const perType = await Promise.all(
    configs.map(async (config) => {
      const { records } = await client.fetchAllRecords(config.path, config.embeddedKey, {
        maxPages,
      });
      return records.map((record): AnActionRecord | null => {
        const anId = extractAnId(record);
        if (!anId) return null;
        const title =
          (record.title as string | undefined) ??
          (record.name as string | undefined) ??
          "(untitled)";
        let total: number | null = null;
        for (const field of config.countFields) {
          const v = record[field];
          if (typeof v === "number") {
            total = v;
            break;
          }
        }
        return {
          resource_type: config.type,
          id: anId,
          title,
          browser_url: (record.browser_url as string | undefined) ?? null,
          created_date: (record.created_date as string | undefined) ?? null,
          total_records: total,
        };
      });
    })
  );

  let actions = perType.flat().filter((a): a is AnActionRecord => a != null);
  if (q) actions = actions.filter((a) => a.title.toLowerCase().includes(q));
  actions.sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));
  return actions;
}
