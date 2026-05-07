import { loadConfig } from "../config";
import { logger } from "../logger";
import { politeFetch } from "../http/fetch";
import { parseListing, buildPageUrl } from "../parsers/nopsema-list";
import { parseDetail } from "../parsers/nopsema-detail";
import {
  jurisdictionFromRegion,
  jurisdictionFromText,
  regionCodeFromName,
} from "../parsers/jurisdiction";
import type { NormalisedUpcomingProject, SourceAdapter } from "./types";

const MAX_PAGES = 50;

function parseDate(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // NOPSEMA prints dates like "08 May, 2026" (the Locations field) and
  // "25 November, 2025"; some other dates use dd/mm/yyyy. "Pending
  // titleholder notification" and similar non-dates pass through Date()
  // and produce NaN which we map to null.
  const longForm = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/);
  if (longForm) {
    const [, d, monName, y] = longForm;
    const months = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december",
    ];
    const m = months.indexOf(monName!.toLowerCase());
    if (m >= 0) {
      return `${y}-${String(m + 1).padStart(2, "0")}-${d!.padStart(2, "0")}`;
    }
  }
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

    // Step 1: fetch page 1 to discover total pagination.
    const firstHtml = await politeFetch(cfg.NOPSEMA_URL);
    const first = parseListing(firstHtml, cfg.NOPSEMA_URL);
    const maxPage = Math.min(
      first.pageNumbers.length > 0 ? Math.max(...first.pageNumbers) : 1,
      MAX_PAGES
    );
    logger.info({ rowsOnFirstPage: first.rows.length, maxPage }, "NOPSEMA pagination discovered");

    // Combine all listing rows across pages (deduped by external_id).
    const allRows = [...first.rows];
    const seenIds = new Set(allRows.map((r) => r.external_id));

    for (let page = 2; page <= maxPage; page++) {
      const pageUrl = buildPageUrl(cfg.NOPSEMA_URL, page);
      logger.info({ page, pageUrl }, "fetching NOPSEMA listing page");
      const html = await politeFetch(pageUrl);
      const { rows } = parseListing(html, pageUrl);
      for (const row of rows) {
        if (seenIds.has(row.external_id)) continue;
        seenIds.add(row.external_id);
        allRows.push(row);
      }
    }

    logger.info({ totalRows: allRows.length }, "NOPSEMA listing complete; fetching details");

    // Step 2: visit each detail page once to fill region + dates.
    for (const row of allRows) {
      let detail = {
        project_name: null as string | null,
        associated_project: null as string | null,
        location_text: null as string | null,
        region_name: null as string | null,
        start_date: null as string | null,
        end_date: null as string | null,
        status: null as string | null,
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

      const regionCode = regionCodeFromName(detail.region_name);
      const jurisdiction =
        jurisdictionFromRegion(regionCode) ??
        jurisdictionFromText(detail.location_text) ??
        jurisdictionFromText(row.title);

      // We pre-filter via the URL's regions_filter[] params, so the
      // listing already contains only WA/NT records. If the detail page
      // didn't yield a recognisable region, default to WA (the dominant
      // jurisdiction in NOPSEMA's WA+NT slice) rather than dropping the
      // record entirely.
      const finalJurisdiction = jurisdiction ?? "WA";

      results.push({
        source: "nopsema",
        external_id: row.external_id,
        title: row.title,
        activity_type: row.activity_type,
        lifecycle_classification: row.lifecycle_classification,
        project_name: detail.project_name,
        associated_project: detail.associated_project ?? row.associated_project,
        organisation: row.organisation,
        region_code: regionCode,
        jurisdiction: finalJurisdiction,
        location_text: detail.location_text,
        latitude: null,
        longitude: null,
        start_date: parseDate(detail.start_date),
        end_date: parseDate(detail.end_date),
        status: detail.status,
        source_url: row.source_url,
        raw_payload: {
          listing: {
            title: row.title,
            organisation: row.organisation,
            activity_type: row.activity_type,
            lifecycle_classification: row.lifecycle_classification,
            associated_project: row.associated_project,
          },
          detail: detail.raw_fields,
        },
      });
    }

    return results;
  },
};
