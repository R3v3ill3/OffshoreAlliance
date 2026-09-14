/**
 * Collapse multiple submissions by the same person to one "latest" row.
 *
 * AN transaction exports contain one row per submission, so a person who
 * submitted three times appears three times. We keep every row (the
 * submissions count is itself reportable) but flag one per respondent as
 * `is_latest`; aggregations read only those.
 */

import { autoMapParticipationHeader } from "@/lib/import/participation-import-shared";
import { nameKey, normaliseEmail, normalisePhone } from "@/lib/import/worker-matching";
import { parseSubmittedAt, zoneFromHeader } from "./timestamp";

export interface IdentityColumns {
  email: string | null;
  phone: string | null;
  first: string | null;
  last: string | null;
  full: string | null;
  timestamp: string | null;
}

const TIMESTAMP_RE = /^(timestamp|submitted|created|date|time)\b/i;

/** Locate the identity/timestamp columns of an AN export by header name. */
export function detectIdentityColumns(headers: string[]): IdentityColumns {
  const cols: IdentityColumns = {
    email: null,
    phone: null,
    first: null,
    last: null,
    full: null,
    timestamp: null,
  };
  for (const h of headers) {
    const field = autoMapParticipationHeader(h);
    if (field === "email" && !cols.email) cols.email = h;
    else if (field === "phone" && !cols.phone) cols.phone = h;
    else if (field === "first_name" && !cols.first) cols.first = h;
    else if (field === "last_name" && !cols.last) cols.last = h;
    else if (field === "full_name" && !cols.full) cols.full = h;
    else if (!cols.timestamp && TIMESTAMP_RE.test(h.trim())) cols.timestamp = h;
  }
  return cols;
}

export interface DedupedRow {
  row_index: number;
  respondent_key: string | null;
  submitted_at: string | null;
  is_latest: boolean;
  data: Record<string, string>;
}

export interface DedupeSummary {
  rowCount: number;
  responseCount: number;
  duplicateCount: number;
  /** respondent_key → number of submissions, for keys seen more than once. */
  duplicates: { key: string; count: number }[];
  unparsedTimestamps: number;
}

export function respondentKeyFor(
  row: Record<string, string>,
  cols: IdentityColumns
): string | null {
  const email = cols.email ? normaliseEmail(row[cols.email]) : null;
  if (email) return `e:${email}`;
  const phone = cols.phone ? normalisePhone(row[cols.phone]) : null;
  if (phone) return `p:${phone}`;
  let first = cols.first ? row[cols.first] : "";
  let last = cols.last ? row[cols.last] : "";
  if ((!first || !last) && cols.full && row[cols.full]) {
    const parts = row[cols.full].trim().split(/\s+/);
    first = first || parts[0] || "";
    last = last || parts.slice(1).join(" ");
  }
  const nk = nameKey(first, last);
  return nk ? `n:${nk}` : null;
}

/**
 * Assign respondent keys and `is_latest`. Latest = greatest submitted_at;
 * ties (or no timestamps) fall back to the highest row_index, i.e. the last
 * row in the file.
 */
export function dedupeResponses(
  headers: string[],
  rows: Record<string, string>[]
): { rows: DedupedRow[]; summary: DedupeSummary; identity: IdentityColumns } {
  const cols = detectIdentityColumns(headers);
  const zone = zoneFromHeader(cols.timestamp) ?? "America/New_York";
  let unparsed = 0;

  const out: DedupedRow[] = rows.map((data, row_index) => {
    const rawTs = cols.timestamp ? data[cols.timestamp] : "";
    const submitted_at = parseSubmittedAt(rawTs, zone);
    if (rawTs && !submitted_at) unparsed++;
    return {
      row_index,
      respondent_key: respondentKeyFor(data, cols),
      submitted_at,
      is_latest: true,
      data,
    };
  });

  const latestByKey = new Map<string, DedupedRow>();
  const countByKey = new Map<string, number>();
  for (const r of out) {
    if (!r.respondent_key) continue;
    countByKey.set(r.respondent_key, (countByKey.get(r.respondent_key) ?? 0) + 1);
    const cur = latestByKey.get(r.respondent_key);
    if (!cur) {
      latestByKey.set(r.respondent_key, r);
      continue;
    }
    const a = r.submitted_at ?? "";
    const b = cur.submitted_at ?? "";
    if (a > b || (a === b && r.row_index > cur.row_index)) latestByKey.set(r.respondent_key, r);
  }
  for (const r of out) {
    if (r.respondent_key && latestByKey.get(r.respondent_key) !== r) r.is_latest = false;
  }

  const duplicates = Array.from(countByKey.entries())
    .filter(([, c]) => c > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((x, y) => y.count - x.count);
  const responseCount = out.filter((r) => r.is_latest).length;

  return {
    rows: out,
    summary: {
      rowCount: out.length,
      responseCount,
      duplicateCount: out.length - responseCount,
      duplicates,
      unparsedTimestamps: unparsed,
    },
    identity: cols,
  };
}
