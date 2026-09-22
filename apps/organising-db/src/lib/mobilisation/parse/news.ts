import type { FeedItem } from "./feed";

/** GDELT DOC 2.0 ArtList JSON. */
export function parseGdelt(body: unknown): FeedItem[] {
  if (!body || typeof body !== "object") return [];
  const articles = (body as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return [];
  const items: FeedItem[] = [];
  for (const article of articles) {
    if (!article || typeof article !== "object") continue;
    const row = article as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const url = typeof row.url === "string" ? row.url : null;
    if (!title || !url) continue;
    items.push({
      id: url,
      title,
      url,
      publishedAt: gdeltDate(typeof row.seendate === "string" ? row.seendate : null),
      summary: typeof row.domain === "string" ? row.domain : null,
      sourceName: "GDELT",
    });
  }
  return items;
}

function gdeltDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))).toISOString();
}

export function gdeltQueryUrl(query: string): string {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("maxrecords", "25");
  url.searchParams.set("format", "json");
  url.searchParams.set("sourcelang", "english");
  url.searchParams.set("timespan", "2d");
  return url.toString();
}

export function newsApiUrl(query: string, apiKey: string, fromIso: string): string {
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("from", fromIso.slice(0, 10));
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("apiKey", apiKey);
  return url.toString();
}

export function parseNewsApi(body: unknown): FeedItem[] {
  if (!body || typeof body !== "object") return [];
  const articles = (body as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return [];
  const items: FeedItem[] = [];
  for (const article of articles) {
    if (!article || typeof article !== "object") continue;
    const row = article as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const url = typeof row.url === "string" ? row.url : null;
    if (!title || !url || title === "[Removed]") continue;
    const source = row.source && typeof row.source === "object" ? (row.source as { name?: string }).name : null;
    items.push({
      id: url,
      title,
      url,
      publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : null,
      summary: typeof row.description === "string" ? row.description.slice(0, 700) : null,
      sourceName: source ?? "NewsAPI",
    });
  }
  return items;
}
