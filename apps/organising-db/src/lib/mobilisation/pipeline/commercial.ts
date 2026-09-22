import type { Db } from "./context";
import { loadSource, markSource, recordAndAlert, sourceDue, type RadarContext } from "./context";
import { allowedByRobots, fetchText } from "./http";
import { asxCompanyUrl, parseAsxAnnouncements } from "../parse/asx";
import { draftFromArticle, draftFromAsx } from "../parse/commercial";
import { parseFeed } from "../parse/feed";
import { gdeltQueryUrl, newsApiUrl, parseGdelt, parseNewsApi } from "../parse/news";
import { TRADE_FEEDS } from "../seed-data";
import type { SignalDraft } from "../types";
import { looksLikeAward } from "../text";

export async function pollCommercial(db: Db, ctx: RadarContext, force = false): Promise<string[]> {
  const notes: string[] = [];
  notes.push(...(await pollFeeds(db, ctx, force)));
  notes.push(...(await pollAsx(db, ctx, force)));
  notes.push(...(await pollGdelt(db, ctx, force)));
  notes.push(...(await pollNewsApi(db, ctx, force)));
  return notes.filter(Boolean);
}

async function pollFeeds(db: Db, ctx: RadarContext, force: boolean): Promise<string[]> {
  const source = await loadSource(db, "trade_press");
  if (!source || !sourceDue(source, force)) return [];
  const feeds = (Array.isArray(source.config.feeds) ? source.config.feeds : TRADE_FEEDS) as { name: string; url: string }[];
  const now = new Date().toISOString();
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  for (const feed of feeds) {
    if (!(await allowedByRobots(feed.url, ctx.contactEmail))) {
      errors.push(`${feed.name} robots blocked`);
      continue;
    }
    const result = await fetchText(feed.url, { contact: ctx.contactEmail, accept: "application/rss+xml, application/xml, text/xml" });
    if (!result.ok) {
      errors.push(`${feed.name} HTTP ${result.status}`);
      continue;
    }
    for (const item of parseFeed(result.text, feed.name)) {
      const draft = draftFromArticle({ item, watch: ctx.watch, sourceKey: "trade_press", sourceLabel: feed.name, now });
      if (draft) drafts.push(draft);
    }
  }
  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, "trade_press", { ok: errors.length === 0, error: errors.join("; ") || null });
  return [`trade_press created ${saved.created}, alerts ${saved.alerts.length}`, ...errors];
}

async function pollAsx(db: Db, ctx: RadarContext, force: boolean): Promise<string[]> {
  const source = await loadSource(db, "asx");
  if (!source || !sourceDue(source, force)) return [];
  const tickers = new Map<string, string>();
  for (const keyword of ctx.watch.keywords) {
    if (keyword.is_active && keyword.asx_ticker) tickers.set(keyword.asx_ticker.toUpperCase(), keyword.keyword);
  }
  for (const contractor of ctx.watch.contractors) {
    if (contractor.is_active && contractor.asx_ticker) tickers.set(contractor.asx_ticker.toUpperCase(), contractor.canonical_name);
  }
  const now = new Date().toISOString();
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  for (const [ticker, name] of tickers) {
    const url = asxCompanyUrl(ticker);
    const result = await fetchText(url, { contact: ctx.contactEmail, accept: "application/json" });
    if (!result.ok) {
      errors.push(`ASX ${ticker} HTTP ${result.status}`);
      continue;
    }
    let body: unknown;
    try {
      body = JSON.parse(result.text);
    } catch {
      errors.push(`ASX ${ticker} was not JSON`);
      continue;
    }
    for (const item of parseAsxAnnouncements(body, ticker)) {
      if (!looksLikeAward(item.headline) && !/vessel|mobilis|offshore|project|contract|campaign/i.test(item.headline)) {
        continue;
      }
      const draft = draftFromAsx({ item, watch: ctx.watch, now, subjectName: name });
      if (draft) drafts.push(draft);
    }
  }
  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, "asx", { ok: errors.length === 0, error: errors.join("; ") || null });
  return [`asx created ${saved.created}, alerts ${saved.alerts.length}`, ...errors];
}

async function pollGdelt(db: Db, ctx: RadarContext, force: boolean): Promise<string[]> {
  const source = await loadSource(db, "gdelt");
  if (!source || !sourceDue(source, force)) return [];
  const active = ctx.watch.contractors.filter((c) => c.is_active);
  if (active.length === 0) {
    await markSource(db, "gdelt", { ok: true, error: null });
    return ["gdelt no active contractors"];
  }
  const cursor = { ...(source.cursor ?? {}) } as { index?: number };
  const start = cursor.index ?? 0;
  const batch = [0, 1, 2].map((offset) => active[(start + offset) % active.length]!).filter((v, i, a) => a.indexOf(v) === i);
  const now = new Date().toISOString();
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  for (const contractor of batch) {
    const query = `"${contractor.canonical_name}" (Australia OR Woodside OR Santos OR Chevron OR INPEX OR "North West" OR Scarborough)`;
    const result = await fetchText(gdeltQueryUrl(query), { contact: ctx.contactEmail, accept: "application/json" });
    if (!result.ok) {
      errors.push(`GDELT ${contractor.canonical_name} HTTP ${result.status}`);
      continue;
    }
    let body: unknown = {};
    try {
      body = JSON.parse(result.text);
    } catch {
      errors.push(`GDELT ${contractor.canonical_name} was not JSON`);
      continue;
    }
    for (const item of parseGdelt(body)) {
      const draft = draftFromArticle({
        item,
        watch: ctx.watch,
        sourceKey: "gdelt",
        sourceLabel: "GDELT",
        now,
      });
      if (draft) drafts.push(draft);
    }
  }
  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, "gdelt", {
    ok: errors.length === 0,
    error: errors.join("; ") || null,
    cursor: { index: (start + batch.length) % active.length },
  });
  return [`gdelt created ${saved.created}, alerts ${saved.alerts.length}`, ...errors];
}

async function pollNewsApi(db: Db, ctx: RadarContext, force: boolean): Promise<string[]> {
  const source = await loadSource(db, "newsapi");
  if (!source || !sourceDue(source, force)) return [];
  const key = process.env.NEWSAPI_KEY;
  if (!key) {
    await markSource(db, "newsapi", { ok: true, error: null });
    return ["newsapi skipped (no NEWSAPI_KEY)"];
  }
  const names = ctx.watch.contractors.filter((c) => c.is_active).map((c) => `"${c.canonical_name}"`).slice(0, 6);
  if (names.length === 0) return [];
  const from = new Date(Date.now() - 2 * 86400000).toISOString();
  const query = `(${names.join(" OR ")}) AND (Australia OR Woodside OR Santos OR Chevron)`;
  const result = await fetchText(newsApiUrl(query, key, from), { contact: ctx.contactEmail, accept: "application/json" });
  if (!result.ok) {
    await markSource(db, "newsapi", { ok: false, error: `HTTP ${result.status}` });
    return [`newsapi HTTP ${result.status}`];
  }
  let body: unknown = {};
  try {
    body = JSON.parse(result.text);
  } catch {
    await markSource(db, "newsapi", { ok: false, error: "not JSON" });
    return ["newsapi was not JSON"];
  }
  const now = new Date().toISOString();
  const drafts: SignalDraft[] = [];
  for (const item of parseNewsApi(body)) {
    const draft = draftFromArticle({ item, watch: ctx.watch, sourceKey: "newsapi", sourceLabel: "NewsAPI", now });
    if (draft) drafts.push(draft);
  }
  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, "newsapi", { ok: true, error: null });
  return [`newsapi created ${saved.created}, alerts ${saved.alerts.length}`];
}
