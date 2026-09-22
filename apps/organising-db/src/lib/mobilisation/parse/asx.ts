export interface AsxAnnouncement {
  id: string;
  ticker: string;
  headline: string;
  url: string | null;
  publishedAt: string | null;
  priceSensitive: boolean;
}

/**
 * The ASX site reads a few JSON shapes. Accept the Markit research payload
 * (`data.items`), a bare `data` array, and a headline/documentKey list.
 */
export function parseAsxAnnouncements(body: unknown, ticker: string): AsxAnnouncement[] {
  const items = unwrap(body);
  const out: AsxAnnouncement[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const headline = str(row.headline) || str(row.header) || str(row.title);
    if (!headline) continue;
    const id = str(row.documentKey) || str(row.id) || str(row.announcement_id) || `${ticker}:${headline}`;
    const url = str(row.url) || str(row.file_url) || str(row.link) || documentUrl(str(row.documentKey));
    const published =
      str(row.date) ||
      str(row.document_release_date) ||
      str(row.announcement_date) ||
      str(row.announcedAt);
    out.push({
      id,
      ticker: str(row.symbol) || ticker,
      headline,
      url,
      publishedAt: published ? safeIso(published) : null,
      priceSensitive: bool(row.priceSensitive) || bool(row.is_price_sensitive) || bool(row.isPriceSensitive),
    });
  }
  return out;
}

function unwrap(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.announcements)) return data.announcements;
  }
  if (Array.isArray(record.items)) return record.items;
  return [];
}

function documentUrl(key: string | null): string | null {
  if (!key) return null;
  return `https://www.asx.com.au/asx/statistics/displayAnnouncement.do?display=pdf&idsId=${encodeURIComponent(key)}`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === "Y";
}

function safeIso(value: string): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function asxCompanyUrl(ticker: string): string {
  return `https://asx.api.markitdigital.com/asx-research/1.0/companies/${encodeURIComponent(ticker)}/announcements?count=20`;
}
