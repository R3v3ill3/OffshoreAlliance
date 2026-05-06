import { loadConfig } from "../config";

export function buildUserAgent(): string {
  const cfg = loadConfig();
  return `OffshoreAlliance-Bot/1.0 (+${cfg.SCRAPER_CONTACT_EMAIL})`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function politeFetch(url: string): Promise<string> {
  const cfg = loadConfig();
  const response = await fetch(url, {
    headers: {
      "user-agent": buildUserAgent(),
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Fetch ${url} -> HTTP ${response.status}`);
  }
  await sleep(cfg.SCRAPE_REQUEST_DELAY_MS);
  return await response.text();
}
