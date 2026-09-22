import type { Db } from "./context";
import { loadSource, markSource, recordAndAlert, sourceDue, type RadarContext } from "./context";
import { allowedByRobots, fetchBuffer, fetchText, pdfToText, sleep } from "./http";
import { matchEntities } from "../match";
import { classifyRegion } from "../text";
import {
  buildPageUrl,
  draftFromNopsema,
  nopsemaContentHash,
  parseNopsemaDetail,
  parseNopsemaListing,
  pdfsWorthFetching,
  type NopsemaListingRow,
} from "../parse/nopsema";
import { draftFromArticle } from "../parse/commercial";
import { parseHtmlHeadlines } from "../parse/feed";
import { NOPSEMA_LISTINGS } from "../seed-data";
import type { SignalDraft } from "../types";

const DETAIL_CAP = 20;

export async function pollRegulatory(db: Db, ctx: RadarContext, force = false): Promise<string[]> {
  const notes: string[] = [];
  notes.push(...(await pollNopsema(db, ctx, force)));
  notes.push(...(await pollNoticePages(db, ctx, force, "nopsema_notices", "NOPSEMA notices")));
  notes.push(...(await pollNoticePages(db, ctx, force, "nopta", "NOPTA")));
  return notes;
}

async function pollNopsema(db: Db, ctx: RadarContext, force: boolean): Promise<string[]> {
  const source = await loadSource(db, "nopsema_ep");
  if (!source) return ["nopsema_ep missing"];
  if (!sourceDue(source, force)) return ["nopsema_ep skipped (cadence)"];
  const now = new Date().toISOString();
  const listings = (Array.isArray(source.config.listings) ? source.config.listings : NOPSEMA_LISTINGS) as {
    key: string;
    label: string;
    url: string;
  }[];
  const cursor = { ...(source.cursor ?? {}) } as { hashes?: Record<string, string> };
  const hashes = { ...(cursor.hashes ?? {}) };
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  let details = 0;

  for (const listing of listings) {
    if (!(await allowedByRobots(listing.url, ctx.contactEmail))) {
      errors.push(`${listing.key} blocked by robots.txt`);
      continue;
    }
    const first = await fetchText(listing.url, { contact: ctx.contactEmail });
    if (!first.ok) {
      errors.push(`${listing.key} HTTP ${first.status} ${first.error ?? ""}`.trim());
      continue;
    }
    const parsed = parseNopsemaListing(first.text, listing.url);
    const pages = parsed.pageNumbers.filter((n) => n > 1).slice(0, 2);
    const rows = [...parsed.rows];
    for (const page of pages) {
      await sleep(800);
      const next = await fetchText(buildPageUrl(listing.url, page), { contact: ctx.contactEmail });
      if (!next.ok) continue;
      rows.push(...parseNopsemaListing(next.text, listing.url).rows);
    }
    for (const row of rows) {
      if (details >= DETAIL_CAP) break;
      const listingText = [row.title, row.organisation, row.location, row.activityType, row.project].filter(Boolean).join(" ");
      if (!listingIsInteresting(listingText, ctx)) {
        hashes[`${listing.key}:${row.externalId}`] = "skip";
        continue;
      }
      const key = `${listing.key}:${row.externalId}`;
      const listingHash = nopsemaContentHash(row, null);
      if (hashes[key] === listingHash) continue;
      details += 1;
      await sleep(1000);
      const detailResult = await fetchText(row.sourceUrl, { contact: ctx.contactEmail });
      const detail = detailResult.ok ? parseNopsemaDetail(detailResult.text, row.sourceUrl) : null;
      let extra = "";
      if (detail) {
        const pdf = pdfsWorthFetching(detail)[0];
        if (pdf && (pdf.sizeMb == null || pdf.sizeMb <= 8)) {
          const file = await fetchBuffer(pdf.url, { contact: ctx.contactEmail, timeoutMs: 30_000 });
          if (file.ok && file.bytes && file.bytes.length < 8 * 1024 * 1024) {
            try {
              extra = (await pdfToText(file.bytes)).slice(0, 20_000);
            } catch (error) {
              errors.push(`pdf ${row.externalId}: ${error instanceof Error ? error.message : "parse failed"}`);
            }
          }
        }
      }
      hashes[key] = listingHash;
      const draft = draftFromNopsema({
        row,
        detail,
        extraText: extra,
        watch: ctx.watch,
        sourceKey: "nopsema_ep",
        sourceLabel: listing.label,
        now,
      });
      if (draft) drafts.push(draft);
    }
  }

  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, "nopsema_ep", {
    ok: errors.length === 0,
    error: errors.join("; ") || null,
    cursor: { hashes },
  });
  return [
    `nopsema_ep created ${saved.created}, corroborated ${saved.corroborated}, alerts ${saved.alerts.length}`,
    ...errors,
  ];
}

function listingIsInteresting(text: string, ctx: RadarContext): boolean {
  const match = matchEntities(text, ctx.watch);
  if (match.contractors.length || match.vessels.length || match.operators.length || match.projects.length || match.sevenFleet) {
    return true;
  }
  const region = classifyRegion(text);
  return region === "nw" || region === "mixed";
}

async function pollNoticePages(
  db: Db,
  ctx: RadarContext,
  force: boolean,
  sourceKey: string,
  label: string
): Promise<string[]> {
  const source = await loadSource(db, sourceKey);
  if (!source || !sourceDue(source, force)) return [];
  const pages = Array.isArray(source.config.pages) ? (source.config.pages as string[]) : [];
  const now = new Date().toISOString();
  const drafts: SignalDraft[] = [];
  const errors: string[] = [];
  for (const page of pages) {
    if (!(await allowedByRobots(page, ctx.contactEmail))) {
      errors.push(`${sourceKey} robots blocked`);
      continue;
    }
    const result = await fetchText(page, { contact: ctx.contactEmail });
    if (!result.ok) {
      errors.push(`${sourceKey} HTTP ${result.status}`);
      continue;
    }
    for (const item of parseHtmlHeadlines(result.text, page)) {
      const draft = draftFromArticle({
        item: { ...item, sourceName: label },
        watch: ctx.watch,
        sourceKey,
        sourceLabel: label,
        now,
      });
      if (!draft) continue;
      draft.source_layer = "regulatory";
      draft.signal_type = /notice|direction|enforcement|improvement|prohibition/i.test(draft.title)
        ? "enforcement"
        : "news";
      draft.confidence = Math.min(draft.confidence, 0.62);
      drafts.push(draft);
    }
  }
  const saved = await recordAndAlert(db, ctx, drafts, now);
  await markSource(db, sourceKey, { ok: errors.length === 0, error: errors.join("; ") || null });
  return [`${sourceKey} created ${saved.created}, alerts ${saved.alerts.length}`, ...errors];
}

export type { NopsemaListingRow };
