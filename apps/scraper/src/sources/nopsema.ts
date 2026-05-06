import { loadConfig } from "../config";
import { logger } from "../logger";
import { politeFetch } from "../http/fetch";
import { parseListing } from "../parsers/nopsema-list";
import { parseDetail } from "../parsers/nopsema-detail";
import {
  jurisdictionFromRegion,
  jurisdictionFromText,
} from "../parsers/jurisdiction";
import type { NormalisedUpcomingProject, SourceAdapter } from "./types";

const MAX_PAGES = 50;

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Accept dd/mm/yyyy and yyyy-mm-dd styles.
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export const nopsemaAdapter: SourceAdapter = {
  id: "nopsema",
  async fetchAll(): Promise<NormalisedUpcomingProject[]> {
    const cfg = loadConfig();
    const results: NormalisedUpcomingProject[] = [];

    let pageUrl: string | null = cfg.NOPSEMA_URL;
    let pages = 0;

    while (pageUrl && pages < MAX_PAGES) {
      pages += 1;
      logger.info({ pageUrl, page: pages }, "fetching NOPSEMA listing page");
      const html: string = await politeFetch(pageUrl);
      const { rows, nextPageUrl } = parseListing(html, pageUrl);

      for (const row of rows) {
        let detail = {
          project_name: null as string | null,
          associated_project: null as string | null,
          location_text: null as string | null,
          end_date: null as string | null,
          raw_fields: {} as Record<string, string>,
        };
        try {
          const detailHtml = await politeFetch(row.source_url);
          detail = parseDetail(detailHtml);
        } catch (err) {
          logger.warn(
            { url: row.source_url, err: (err as Error).message },
            "detail fetch failed; using listing data only"
          );
        }

        const jurisdiction =
          jurisdictionFromRegion(row.region_code) ??
          jurisdictionFromText(detail.location_text) ??
          jurisdictionFromText(row.title);

        // Filter to WA + NT only at extraction time.
        if (jurisdiction !== "WA" && jurisdiction !== "NT") {
          logger.debug(
            { id: row.external_id, region: row.region_code, location: detail.location_text },
            "skipping record outside WA/NT"
          );
          continue;
        }

        results.push({
          source: "nopsema",
          external_id: row.external_id,
          title: row.title,
          activity_type: row.activity_type,
          lifecycle_classification: row.lifecycle_classification,
          project_name: detail.project_name,
          associated_project: detail.associated_project,
          organisation: row.organisation,
          region_code: row.region_code,
          jurisdiction,
          location_text: detail.location_text,
          latitude: null,
          longitude: null,
          start_date: parseDate(row.start_date),
          end_date: parseDate(detail.end_date),
          status: row.status,
          source_url: row.source_url,
          raw_payload: {
            listing: {
              title: row.title,
              organisation: row.organisation,
              activity_type: row.activity_type,
              lifecycle_classification: row.lifecycle_classification,
              region_code: row.region_code,
              status: row.status,
              start_date: row.start_date,
            },
            detail: detail.raw_fields,
          },
        });
      }

      pageUrl = nextPageUrl;
    }

    if (pages >= MAX_PAGES) {
      logger.warn({ pages }, "stopped paginating at MAX_PAGES safety limit");
    }

    return results;
  },
};
