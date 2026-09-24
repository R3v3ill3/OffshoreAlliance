import * as cheerio from "cheerio";
import { regulatoryDedup, regulatoryFingerprint } from "../dedup";
import { regulatoryConfidence } from "../confidence";
import {
  matchEntities,
  matchedTerms,
  matchWorksite,
  primaryContractorId,
  primaryVesselId,
  primaryWatchContractor,
} from "../match";
import { parseStayWindow } from "../schedule";
import type { SignalDraft, SignalType, Watchlist } from "../types";
import { classifyRegion } from "../text";

export interface NopsemaListingRow {
  externalId: string;
  sourceUrl: string;
  title: string | null;
  activityType: string | null;
  lifecycle: string | null;
  organisation: string | null;
  project: string | null;
  location: string | null;
  status: string | null;
  submissionDate: string | null;
  resubmissionDate: string | null;
}

export interface NopsemaDetail {
  fields: Record<string, string>;
  summary: string;
  pdfLinks: { label: string; url: string; sizeMb: number | null }[];
}

const ACTIVITY_HREF = /\/(?:activities|environment_plans|proposals)\/(\d+)\/show_public/;

export function parseNopsemaListing(html: string, baseUrl: string): {
  rows: NopsemaListingRow[];
  pageNumbers: number[];
} {
  const $ = cheerio.load(html);
  const header = headerIndex($);
  const seen = new Set<string>();
  const rows: NopsemaListingRow[] = [];

  $("table tbody tr").each((_, el) => {
    const $row = $(el);
    const cells = $row
      .find("td")
      .toArray()
      .map((c) => $(c).text().trim().replace(/\s+/g, " "));
    const link = $row
      .find("a[href]")
      .toArray()
      .map((a) => $(a).attr("href") ?? "")
      .find((href) => ACTIVITY_HREF.test(href));
    if (!link) return;
    const id = link.match(ACTIVITY_HREF)?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const cell = (key: keyof typeof header) => {
      const idx = header[key];
      return idx == null ? null : cells[idx] || null;
    };
    rows.push({
      externalId: id,
      sourceUrl: new URL(link, baseUrl).toString(),
      title: cell("title"),
      activityType: cell("activityType"),
      lifecycle: cell("lifecycle"),
      organisation: cell("organisation"),
      project: cell("project"),
      location: cell("location"),
      status: cell("status"),
      submissionDate: cell("submission"),
      resubmissionDate: cell("resubmission"),
    });
  });

  const pageNumbers = new Set<number>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const match = href.match(/(?:activity_page|page)=(\d+)/);
    if (match?.[1]) pageNumbers.add(Number(match[1]));
  });

  return { rows, pageNumbers: [...pageNumbers].sort((a, b) => a - b) };
}

function headerIndex($: cheerio.CheerioAPI): Record<string, number | undefined> {
  const labels = $("table thead th, table tr")
    .first()
    .find("th")
    .toArray()
    .map((th) => $(th).text().toLowerCase().replace(/\s+/g, " ").trim());
  const find = (...needles: string[]) => {
    const idx = labels.findIndex((label) => needles.some((n) => label.includes(n)));
    return idx >= 0 ? idx : undefined;
  };
  const mapped = {
    title: find("activity name", "title"),
    activityType: find("activity type"),
    lifecycle: find("lifecycle"),
    organisation: find("submitted", "organisation", "titleholder"),
    project: find("project"),
    location: find("location"),
    status: find("status", "outcome"),
    submission: find("submission date"),
    resubmission: find("resubmission"),
  };
  // Approved-activities tables have no useful header match for title in
  // column 0 when thead is absent. Fall back to the column order the
  // existing upcoming-projects scraper already depends on.
  if (mapped.title == null) {
    return {
      title: 0,
      activityType: 1,
      lifecycle: 2,
      organisation: 3,
      project: 4,
      location: undefined,
      status: undefined,
      submission: undefined,
      resubmission: undefined,
    };
  }
  return mapped;
}

export function parseNopsemaDetail(html: string, pageUrl: string): NopsemaDetail {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("th, td").toArray();
    if (cells.length < 2) return;
    const key = $(cells[0]!).text().toLowerCase().replace(/\s+/g, " ").replace(/[:.]+$/, "").trim();
    const value = $(cells[1]!).text().trim().replace(/\s+/g, " ");
    if (key && value) fields[key] = value;
  });
  const summary =
    fields["activity description"] ||
    fields["summary"] ||
    fields["description"] ||
    $("article, .activity-description, #content").text().replace(/\s+/g, " ").trim().slice(0, 4000);

  const pdfLinks: NopsemaDetail["pdfLinks"] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!/\.pdf($|\?)/i.test(href) && !/ep document|opep|osmp/i.test($(a).text())) return;
    if (!/\.pdf($|\?)/i.test(href) && !/document/i.test(href)) return;
    const label = $(a).parent().text().replace(/\s+/g, " ").trim() || $(a).text().trim();
    const size = label.match(/\((\d+(?:\.\d+)?)\s*(KB|MB)\)/i);
    let sizeMb: number | null = null;
    if (size) {
      const n = Number(size[1]);
      sizeMb = /kb/i.test(size[2]!) ? n / 1024 : n;
    }
    try {
      pdfLinks.push({ label, url: new URL(href, pageUrl).toString(), sizeMb });
    } catch {
      /* ignore malformed hrefs */
    }
  });
  return { fields, summary: summary.slice(0, 4000), pdfLinks };
}

export function classifyNopsemaType(row: NopsemaListingRow, detail: NopsemaDetail | null): SignalType {
  const status = `${row.status ?? ""} ${detail?.fields["outcome"] ?? ""} ${detail?.fields["status"] ?? ""}`;
  const title = `${row.title ?? ""} ${detail?.fields["activity name"] ?? ""}`;
  if (/variation|varied/i.test(title) || row.resubmissionDate) return "ep_varied";
  if (/accepted/i.test(status)) return "ep_accepted";
  if (/notice|direction|enforcement|improvement/i.test(title + status)) return "enforcement";
  if (/notification/i.test(title) || detail?.fields["start date"]) {
    const start = detail?.fields["start date"] ?? "";
    if (start && !/pending/i.test(start)) return "activity_notification";
  }
  return "ep_lodged";
}

export function nopsemaContentHash(row: NopsemaListingRow, detail: NopsemaDetail | null): string {
  return [
    row.status,
    row.resubmissionDate,
    row.submissionDate,
    detail?.fields["outcome"],
    detail?.fields["start date"],
    detail?.fields["acceptance date"],
    detail?.summary.slice(0, 200),
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

const PDF_MAX_MB = 8;

export function pdfsWorthFetching(detail: NopsemaDetail): NopsemaDetail["pdfLinks"] {
  return detail.pdfLinks.filter((pdf) => pdf.sizeMb == null || pdf.sizeMb <= PDF_MAX_MB).slice(0, 2);
}

export function draftFromNopsema(input: {
  row: NopsemaListingRow;
  detail: NopsemaDetail | null;
  extraText: string;
  watch: Watchlist;
  sourceKey: string;
  sourceLabel: string;
  now: string;
}): SignalDraft | null {
  const detailText = input.detail
    ? Object.entries(input.detail.fields)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n") +
      "\n" +
      input.detail.summary
    : "";
  const text = [
    input.row.title,
    input.row.activityType,
    input.row.lifecycle,
    input.row.organisation,
    input.row.project,
    input.row.location,
    input.row.status,
    detailText,
    input.extraText,
  ]
    .filter(Boolean)
    .join("\n");

  const match = matchEntities(text, input.watch);
  const region = classifyRegion(text);
  const named =
    match.contractors.length > 0 ||
    match.vessels.length > 0 ||
    match.operators.length > 0 ||
    match.sevenFleet;
  // A plan that names nobody on the watchlist is not a mobilisation signal,
  // even in the right basin. Region-only noise would flood the feed.
  if (!named && !match.projects.length) return null;
  if (!named && region !== "nw" && region !== "mixed") return null;

  const signalType = classifyNopsemaType(input.row, input.detail);
  const scored = regulatoryConfidence({ text, match, signalType });
  const worksite = matchWorksite(text, input.watch.worksites);
  const watchContractor = primaryWatchContractor(match, input.watch);
  const title = input.row.title || input.detail?.fields["activity name"] || `NOPSEMA ${input.row.externalId}`;
  const stay = parseStayWindow(text);
  const status = input.row.status || input.detail?.fields["outcome"] || "";
  const updated =
    input.row.resubmissionDate ||
    input.detail?.fields["acceptance date"] ||
    input.detail?.fields["start date"] ||
    input.row.submissionDate ||
    status ||
    "seen";

  return {
    source_layer: "regulatory",
    source: input.sourceLabel,
    source_key: input.sourceKey,
    signal_type: signalType,
    occurred_at: parseLooseDate(input.row.submissionDate) ?? input.now,
    title,
    extract: (input.detail?.summary || input.row.activityType || "").slice(0, 700) || null,
    url: input.row.sourceUrl,
    confidence: scored.confidence,
    in_region: scored.inRegion,
    vessel_id: primaryVesselId(match),
    contractor_id: primaryContractorId(match) ?? watchContractor?.employer_id ?? null,
    watch_contractor_id: watchContractor?.watch_id ?? null,
    operator_id: worksite?.operator_id ?? null,
    worksite_id: worksite?.worksite_id ?? null,
    geofence_id: null,
    sector_id: null,
    dedup_key: regulatoryDedup(input.row.externalId, status || signalType, updated),
    fingerprint: regulatoryFingerprint(`${input.sourceKey}:${input.row.externalId}`),
    external_id: input.row.externalId,
    matched_terms: matchedTerms(match),
    region_label: input.row.location || scored.regionLabel,
    arrival_at: stay.arrivalAt,
    ends_at: stay.endsAt,
  };
}

export function parseLooseDate(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, "$1").replace(/,/g, "");
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function buildPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("activity_page", String(page));
  return url.toString();
}
