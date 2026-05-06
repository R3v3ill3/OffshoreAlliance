import * as cheerio from "cheerio";

export interface ListingRow {
  external_id: string;
  source_url: string;
  // Listing-page columns we can read without visiting the detail page.
  // Selectors are best-effort against NOPSEMA's HTML; calibrate after
  // the first live run by inspecting the rendered DOM.
  title: string | null;
  organisation: string | null;
  activity_type: string | null;
  lifecycle_classification: string | null;
  region_code: string | null;
  status: string | null;
  start_date: string | null;
  raw_html: string;
}

const POSSIBLE_NEXT_LINKS = [
  'a[rel="next"]',
  'a.next_page',
  'a[aria-label="Next"]',
  'a:contains("Next")',
];

export function parseListing(
  html: string,
  baseUrl: string
): { rows: ListingRow[]; nextPageUrl: string | null } {
  const $ = cheerio.load(html);
  const rows: ListingRow[] = [];

  // NOPSEMA renders results as a table; each <tr> in tbody represents
  // one approved project/activity. Cells are unlabelled so we read by
  // index and trim. If the layout changes, adjust here.
  $("table tbody tr").each((_, el) => {
    const $row = $(el);
    const cells = $row
      .find("td")
      .toArray()
      .map((c) => $(c).text().trim());

    const link = $row.find('a[href*="/home/approved_projects_and_activities/"]').first();
    const href = link.attr("href") ?? "";
    if (!href) return;

    const sourceUrl = new URL(href, baseUrl).toString();
    // External ID is the trailing path segment (slug or numeric id).
    const slug = sourceUrl.split("/").filter(Boolean).pop() ?? sourceUrl;

    rows.push({
      external_id: slug,
      source_url: sourceUrl,
      title: link.text().trim() || cells[0] || null,
      organisation: cells[1] ?? null,
      activity_type: cells[2] ?? null,
      lifecycle_classification: cells[3] ?? null,
      region_code: cells[4] ?? null,
      status: cells[5] ?? null,
      start_date: cells[6] ?? null,
      raw_html: $row.html() ?? "",
    });
  });

  let nextPageUrl: string | null = null;
  for (const sel of POSSIBLE_NEXT_LINKS) {
    const next = $(sel).first();
    if (next.length) {
      const href = next.attr("href");
      if (href) {
        nextPageUrl = new URL(href, baseUrl).toString();
        break;
      }
    }
  }

  return { rows, nextPageUrl };
}
