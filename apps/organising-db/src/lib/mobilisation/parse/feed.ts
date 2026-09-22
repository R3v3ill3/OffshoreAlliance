export interface FeedItem {
  id: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  summary: string | null;
  sourceName: string | null;
}

/** Minimal RSS 2.0 and Atom reader. Enough for trade-press and contractor feeds. */
export function parseFeed(xml: string, feedName: string | null = null): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const title = decode(textOf(block, "title"));
    const link = atomLink(block) || decode(textOf(block, "link"));
    const guid = decode(textOf(block, "guid") || textOf(block, "id"));
    const published = textOf(block, "pubDate") || textOf(block, "published") || textOf(block, "updated") || textOf(block, "dc:date");
    const summary = decode(textOf(block, "description") || textOf(block, "summary") || textOf(block, "content"));
    if (!title && !link) continue;
    items.push({
      id: guid || link || title,
      title: title || link || "Untitled",
      url: link || null,
      publishedAt: published ? safeIso(published) : null,
      summary: summary ? summary.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700) : null,
      sourceName: feedName,
    });
  }
  return items;
}

function textOf(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return match[1]!.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function atomLink(block: string): string {
  const match = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return match?.[1] ?? "";
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function safeIso(value: string): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * News index pages that are not RSS. Pulls anchors whose text looks like a
 * headline. Dates are usually missing; callers stamp detection time.
 */
export function parseHtmlHeadlines(html: string, pageUrl: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1]!;
    const title = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (title.length < 25 || title.length > 220) continue;
    if (/cookie|privacy|subscribe|login|contact/i.test(title)) continue;
    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    items.push({ id: url, title, url, publishedAt: null, summary: null, sourceName: null });
  }
  return items.slice(0, 40);
}
