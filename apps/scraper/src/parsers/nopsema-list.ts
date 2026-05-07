import * as cheerio from "cheerio";

export interface ListingRow {
  external_id: string;
  source_url: string;
  // Columns from the listing table (ordered as NOPSEMA renders them):
  //   0: title (activity name)
  //   1: activity_type
  //   2: lifecycle_classification
  //   3: organisation (titleholder)
  //   4: associated_project (or "No associated project")
  //   5: "View" link → /activities/<id>/show_public
  title: string | null;
  activity_type: string | null;
  lifecycle_classification: string | null;
  organisation: string | null;
  associated_project: string | null;
  raw_html: string;
}

export interface ListingResult {
  rows: ListingRow[];
  pageNumbers: number[];
}

const ACTIVITY_HREF = /\/activities\/(\d+)\/show_public/;

export function parseListing(html: string, baseUrl: string): ListingResult {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const rows: ListingRow[] = [];

  // NOPSEMA renders the same data in two tables (one for desktop layout,
  // one for mobile). We dedupe by external_id so we visit each activity
  // detail page once.
  $("table tbody tr").each((_, el) => {
    const $row = $(el);
    const cells = $row
      .find("td")
      .toArray()
      .map((c) => $(c).text().trim().replace(/\s+/g, " "));

    const viewLink = $row
      .find('a[href*="/activities/"]')
      .filter((_i, a) => /\/activities\/\d+\/show_public/.test($(a).attr("href") ?? ""))
      .first();
    const href = viewLink.attr("href") ?? "";
    const match = href.match(ACTIVITY_HREF);
    if (!match) return;

    const externalId = match[1]!;
    if (seen.has(externalId)) return;
    seen.add(externalId);

    const sourceUrl = new URL(href, baseUrl).toString();

    const associated = cells[4] ?? null;
    rows.push({
      external_id: externalId,
      source_url: sourceUrl,
      title: cells[0] || null,
      activity_type: cells[1] || null,
      lifecycle_classification: cells[2] || null,
      organisation: cells[3] || null,
      associated_project:
        associated && !/^no associated project$/i.test(associated) ? associated : null,
      raw_html: $row.html() ?? "",
    });
  });

  // Pagination links use `?activity_page=N` query params with numeric link
  // text. Collect every number we see so the caller can iterate.
  const pageNumbers = new Set<number>();
  $('a[href*="activity_page="]').each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const m = href.match(/activity_page=(\d+)/);
    if (m && m[1]) pageNumbers.add(parseInt(m[1], 10));
  });

  return { rows, pageNumbers: [...pageNumbers].sort((a, b) => a - b) };
}

// Build a URL for page N by replacing or adding the activity_page param.
export function buildPageUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set("activity_page", String(page));
  return u.toString();
}
